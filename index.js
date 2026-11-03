// Sistema MVP - Projeto de Bloco
// Sistema de Gestão e Vendas - comércio local de Itanhaém/SP
const http = require('node:http');
const { abrirBanco } = require('./database');
const { criarRotas } = require('./routes');

function criarServidor(db = abrirBanco()) {
  return http.createServer(criarRotas(db));
}

if (require.main === module) {
  const porta = Number(process.env.PORT) || 3000;
  criarServidor().listen(porta, () => {
    console.log(`Sistema inicializado com sucesso! Acesse http://localhost:${porta}`);
  });
}

module.exports = { criarServidor };
