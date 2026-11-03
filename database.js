// Camada de dados - SQLite embarcado (módulo nativo node:sqlite)
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function conferirSenha(senha, armazenado) {
  const [salt, hash] = armazenado.split(':');
  const teste = crypto.scryptSync(senha, salt, 64);
  return crypto.timingSafeEqual(teste, Buffer.from(hash, 'hex'));
}

function abrirBanco(caminho = process.env.DB_PATH || 'vendas.db') {
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
      estoque INTEGER NOT NULL CHECK (estoque >= 0)
    );
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      total_centavos INTEGER NOT NULL,
      criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS itens_venda (
      venda_id INTEGER NOT NULL REFERENCES vendas(id),
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      preco_centavos INTEGER NOT NULL
    );
  `);
  popularDadosIniciais(db);
  return db;
}

function popularDadosIniciais(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
  if (n > 0) return;
  db.prepare('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)')
    .run('Alex', 'operador@comercio.com', hashSenha('senha123'));
  const ins = db.prepare('INSERT INTO produtos (codigo, nome, preco_centavos, estoque) VALUES (?, ?, ?, ?)');
  [
    ['001', 'Arroz Tipo 1 5kg', 2500, 14],
    ['002', 'Feijão Carioca 1kg', 850, 30],
    ['003', 'Óleo de Soja 900ml', 600, 22],
    ['004', 'Açúcar Refinado 1kg', 520, 25],
    ['005', 'Café Torrado 500g', 1890, 12],
  ].forEach((p) => ins.run(...p));
}

// ---------- Regras de negócio ----------

function autenticar(db, email, senha) {
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!u || !conferirSenha(String(senha || ''), u.senha)) return null;
  return { id: u.id, nome: u.nome, email: u.email };
}

function listarProdutos(db) {
  return db.prepare('SELECT id, codigo, nome, preco_centavos, estoque FROM produtos ORDER BY codigo').all();
}

class ErroVenda extends Error {}

// RF01 + RF02: registra a venda e abate o estoque na mesma transação
function registrarVenda(db, usuarioId, itens) {
  if (!Array.isArray(itens) || itens.length === 0) throw new ErroVenda('O carrinho está vazio.');
  const buscar = db.prepare('SELECT * FROM produtos WHERE id = ?');
  db.exec('BEGIN');
  try {
    let total = 0;
    const linhas = itens.map(({ produtoId, quantidade }) => {
      const qtd = Number(quantidade);
      if (!Number.isInteger(qtd) || qtd <= 0) throw new ErroVenda('Quantidade inválida.');
      const p = buscar.get(Number(produtoId));
      if (!p) throw new ErroVenda('Produto não encontrado.');
      if (p.estoque < qtd) throw new ErroVenda(`Estoque insuficiente para ${p.nome} (disponível: ${p.estoque}).`);
      total += p.preco_centavos * qtd;
      return { p, qtd };
    });
    const { lastInsertRowid: vendaId } = db
      .prepare('INSERT INTO vendas (usuario_id, total_centavos) VALUES (?, ?)')
      .run(usuarioId, total);
    const insItem = db.prepare('INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_centavos) VALUES (?, ?, ?, ?)');
    const baixa = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?');
    for (const { p, qtd } of linhas) {
      insItem.run(vendaId, p.id, qtd, p.preco_centavos);
      baixa.run(qtd, p.id);
    }
    db.exec('COMMIT');
    return { vendaId: Number(vendaId), totalCentavos: total };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// RF04: relatório resumido do dia
function relatorioDoDia(db, data = new Date().toLocaleDateString('sv-SE')) {
  const resumo = db.prepare(`
    SELECT COUNT(*) AS transacoes, COALESCE(SUM(total_centavos), 0) AS faturamento
    FROM vendas WHERE date(criada_em) = ?`).get(data);
  const maisVendido = db.prepare(`
    SELECT p.nome, SUM(i.quantidade) AS quantidade
    FROM itens_venda i JOIN vendas v ON v.id = i.venda_id JOIN produtos p ON p.id = i.produto_id
    WHERE date(v.criada_em) = ?
    GROUP BY p.id ORDER BY quantidade DESC LIMIT 1`).get(data);
  return {
    data,
    transacoes: resumo.transacoes,
    faturamentoCentavos: resumo.faturamento,
    maisVendido: maisVendido || null,
  };
}

module.exports = { abrirBanco, autenticar, listarProdutos, registrarVenda, relatorioDoDia, ErroVenda, hashSenha, conferirSenha };
