// Rotas HTTP (API JSON + arquivos estáticos)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { autenticar, listarProdutos, registrarVenda, relatorioDoDia, ErroVenda } = require('./database');

const PUBLICO = path.join(__dirname, 'public');
const { version: VERSAO } = require('./package.json');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function criarRotas(db) {
  const sessoes = new Map(); // token -> usuario

  function json(res, status, corpo) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(corpo));
  }

  function lerCorpo(req) {
    return new Promise((ok, falha) => {
      let dados = '';
      req.on('data', (c) => { dados += c; if (dados.length > 1e5) req.destroy(); });
      req.on('end', () => { try { ok(dados ? JSON.parse(dados) : {}); } catch { falha(new ErroVenda('JSON inválido.')); } });
      req.on('error', falha);
    });
  }

  function usuarioDaSessao(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    return sessoes.get(token) || null;
  }

  function servirEstatico(req, res) {
    const url = req.url.split('?')[0];
    const arquivo = path.normalize(path.join(PUBLICO, url === '/' ? 'index.html' : url));
    if (!arquivo.startsWith(PUBLICO) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      res.writeHead(404); return res.end('Não encontrado');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    fs.createReadStream(arquivo).pipe(res);
  }

  return async function rotear(req, res) {
    try {
      const url = req.url.split('?')[0];

      // Health check público usado pelo Render e pelo monitor do GitHub Actions
      if (req.method === 'GET' && url === '/api/saude') {
        try {
          db.prepare('SELECT 1').get();
          return json(res, 200, { status: 'ok', banco: 'ok', versao: VERSAO, uptimeSegundos: Math.round(process.uptime()) });
        } catch {
          return json(res, 503, { status: 'erro', banco: 'indisponivel', versao: VERSAO });
        }
      }

      if (req.method === 'POST' && url === '/api/login') {
        const { email, senha } = await lerCorpo(req);
        const usuario = autenticar(db, email, senha);
        if (!usuario) return json(res, 401, { erro: 'E-mail ou senha incorretos.' });
        const token = crypto.randomBytes(24).toString('hex');
        sessoes.set(token, usuario);
        return json(res, 200, { token, usuario });
      }

      if (url.startsWith('/api/')) {
        const usuario = usuarioDaSessao(req);
        if (!usuario) return json(res, 401, { erro: 'Sessão expirada. Faça login novamente.' });

        if (req.method === 'GET' && url === '/api/produtos') return json(res, 200, listarProdutos(db));
        if (req.method === 'POST' && url === '/api/vendas') {
          const { itens, pagamento } = await lerCorpo(req);
          return json(res, 201, registrarVenda(db, usuario.id, itens, pagamento));
        }
        if (req.method === 'GET' && url === '/api/relatorio') return json(res, 200, relatorioDoDia(db));
        if (req.method === 'POST' && url === '/api/logout') {
          sessoes.delete((req.headers.authorization || '').replace(/^Bearer /, ''));
          return json(res, 200, { ok: true });
        }
        return json(res, 404, { erro: 'Rota não encontrada.' });
      }

      if (req.method === 'GET') return servirEstatico(req, res);
      json(res, 405, { erro: 'Método não permitido.' });
    } catch (e) {
      if (e instanceof ErroVenda) return json(res, 400, { erro: e.message });
      console.error(e);
      json(res, 500, { erro: 'Erro interno. Tente novamente.' }); // RNF02: não expõe detalhes
    }
  };
}

module.exports = { criarRotas };
