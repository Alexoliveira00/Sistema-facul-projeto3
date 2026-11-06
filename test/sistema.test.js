const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco, autenticar, listarProdutos, registrarVenda, relatorioDoDia, ErroVenda } = require('../database');
const { criarServidor } = require('../index');

const novoBanco = () => abrirBanco(':memory:');

describe('Autenticação (RNF01)', () => {
  test('aceita credenciais válidas', () => {
    const u = autenticar(novoBanco(), 'operador@comercio.com', 'senha123');
    assert.equal(u.nome, 'Alex');
    assert.equal(u.senha, undefined, 'não deve devolver o hash da senha');
  });
  test('recusa senha errada e usuário inexistente', () => {
    const db = novoBanco();
    assert.equal(autenticar(db, 'operador@comercio.com', 'errada'), null);
    assert.equal(autenticar(db, 'ninguem@x.com', 'senha123'), null);
  });
});

describe('Vendas e estoque (RF01 / RF02)', () => {
  test('registra venda, calcula total e abate o estoque', () => {
    const db = novoBanco();
    const [arroz, , oleo] = listarProdutos(db);
    const { totalCentavos } = registrarVenda(db, 1, [
      { produtoId: arroz.id, quantidade: 2 },
      { produtoId: oleo.id, quantidade: 1 },
    ]);
    assert.equal(totalCentavos, 5600); // R$ 56,00 como no protótipo
    const depois = listarProdutos(db);
    assert.equal(depois[0].estoque, arroz.estoque - 2);
    assert.equal(depois[2].estoque, oleo.estoque - 1);
  });
  test('bloqueia venda sem estoque e não altera nada (rollback)', () => {
    const db = novoBanco();
    const [arroz, feijao] = listarProdutos(db);
    assert.throws(() => registrarVenda(db, 1, [
      { produtoId: feijao.id, quantidade: 1 },
      { produtoId: arroz.id, quantidade: 999 },
    ]), ErroVenda);
    assert.deepEqual(listarProdutos(db).map((p) => p.estoque), listarProdutos(novoBanco()).map((p) => p.estoque));
  });
  test('rejeita carrinho vazio e quantidades inválidas', () => {
    const db = novoBanco();
    assert.throws(() => registrarVenda(db, 1, []), ErroVenda);
    assert.throws(() => registrarVenda(db, 1, [{ produtoId: 1, quantidade: -1 }]), ErroVenda);
    assert.throws(() => registrarVenda(db, 1, [{ produtoId: 1, quantidade: 1.5 }]), ErroVenda);
  });
});

describe('Finalização do caixa (v1.1 - feedback da validação)', () => {
  test('calcula o troco no pagamento em dinheiro', () => {
    const db = novoBanco();
    const v = registrarVenda(db, 1, [{ produtoId: 1, quantidade: 2 }, { produtoId: 3, quantidade: 1 }],
      { forma: 'dinheiro', valorRecebidoCentavos: 10000 });
    assert.equal(v.totalCentavos, 5600);
    assert.equal(v.trocoCentavos, 4400);
  });
  test('recusa valor recebido menor que o total, sem baixar estoque', () => {
    const db = novoBanco();
    const antes = listarProdutos(db)[0].estoque;
    assert.throws(() => registrarVenda(db, 1, [{ produtoId: 1, quantidade: 1 }],
      { forma: 'dinheiro', valorRecebidoCentavos: 1000 }), /menor que o total/);
    assert.equal(listarProdutos(db)[0].estoque, antes);
  });
  test('aceita Pix/cartão sem troco e rejeita forma inválida', () => {
    const db = novoBanco();
    const v = registrarVenda(db, 1, [{ produtoId: 2, quantidade: 1 }], { forma: 'pix' });
    assert.equal(v.trocoCentavos, 0);
    assert.equal(v.valorRecebidoCentavos, null);
    assert.throws(() => registrarVenda(db, 1, [{ produtoId: 2, quantidade: 1 }], { forma: 'cheque' }), ErroVenda);
  });
  test('relatório separa o faturamento por forma de pagamento', () => {
    const db = novoBanco();
    registrarVenda(db, 1, [{ produtoId: 1, quantidade: 1 }], { forma: 'pix' });
    registrarVenda(db, 1, [{ produtoId: 2, quantidade: 1 }], { forma: 'dinheiro', valorRecebidoCentavos: 1000 });
    const formas = Object.fromEntries(relatorioDoDia(db).porFormaPagamento.map((f) => [f.forma, f.totalCentavos]));
    assert.deepEqual(formas, { pix: 2500, dinheiro: 850 });
  });
});

describe('Relatório diário (RF04)', () => {
  test('consolida transações, faturamento e item mais vendido', () => {
    const db = novoBanco();
    registrarVenda(db, 1, [{ produtoId: 1, quantidade: 3 }]);
    registrarVenda(db, 1, [{ produtoId: 2, quantidade: 1 }]);
    const r = relatorioDoDia(db);
    assert.equal(r.transacoes, 2);
    assert.equal(r.faturamentoCentavos, 3 * 2500 + 850);
    assert.equal(r.maisVendido.nome, 'Arroz Tipo 1 5kg');
  });
});

describe('API HTTP (integração)', () => {
  test('fluxo completo: login → venda → relatório, com resposta < 1,5 s (RNF03)', async () => {
    const servidor = criarServidor(novoBanco()).listen(0);
    const base = `http://localhost:${servidor.address().port}`;
    try {
      const negado = await fetch(`${base}/api/produtos`);
      assert.equal(negado.status, 401);

      const login = await (await fetch(`${base}/api/login`, {
        method: 'POST', body: JSON.stringify({ email: 'operador@comercio.com', senha: 'senha123' }),
      })).json();
      const auth = { Authorization: `Bearer ${login.token}` };

      const inicio = performance.now();
      const venda = await fetch(`${base}/api/vendas`, {
        method: 'POST', headers: auth, body: JSON.stringify({ itens: [{ produtoId: 1, quantidade: 2 }] }),
      });
      assert.ok(performance.now() - inicio < 1500);
      assert.equal(venda.status, 201);

      const semEstoque = await fetch(`${base}/api/vendas`, {
        method: 'POST', headers: auth, body: JSON.stringify({ itens: [{ produtoId: 1, quantidade: 999 }] }),
      });
      assert.equal(semEstoque.status, 400);

      const rel = await (await fetch(`${base}/api/relatorio`, { headers: auth })).json();
      assert.equal(rel.transacoes, 1);

      const pagina = await fetch(`${base}/`);
      assert.match(await pagina.text(), /lang="pt-BR"/);
    } finally {
      servidor.close();
    }
  });
});
