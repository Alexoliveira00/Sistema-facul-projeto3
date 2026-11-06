// Front-end do MVP de vendas
const $ = (id) => document.getElementById(id);
const real = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let token = sessionStorage.getItem('token');
let produtos = [];
const quantidades = {};

// ---------- Acessibilidade: alto contraste e tamanho da fonte ----------
function aplicarPreferencias() {
  const contraste = localStorage.getItem('contraste') === '1';
  document.body.classList.toggle('alto-contraste', contraste);
  $('btnContraste').setAttribute('aria-pressed', String(contraste));
  document.documentElement.style.fontSize = (Number(localStorage.getItem('fonte')) || 100) + '%';
}
$('btnContraste').onclick = () => {
  localStorage.setItem('contraste', localStorage.getItem('contraste') === '1' ? '0' : '1');
  aplicarPreferencias();
  avisar(document.body.classList.contains('alto-contraste') ? 'Alto contraste ativado.' : 'Alto contraste desativado.', 'ok');
};
function mudarFonte(delta) {
  const atual = Number(localStorage.getItem('fonte')) || 100;
  localStorage.setItem('fonte', Math.min(150, Math.max(90, atual + delta)));
  aplicarPreferencias();
}
$('btnFonteMais').onclick = () => mudarFonte(10);
$('btnFonteMenos').onclick = () => mudarFonte(-10);

// ---------- Utilitários ----------
function avisar(msg, tipo = 'ok') {
  const a = $('alerta');
  a.className = `alerta ${tipo}`;
  a.textContent = (tipo === 'ok' ? '✔ ' : '⚠ ') + msg; // ícone + cor + texto (não depende só de cor)
  a.hidden = false;
}
async function api(url, opcoes = {}) {
  const r = await fetch(url, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const corpo = await r.json();
  if (r.status === 401 && url !== '/api/login') { sair(); }
  if (!r.ok) throw new Error(corpo.erro || 'Erro inesperado.');
  return corpo;
}
function mostrar(tela) {
  ['telaLogin', 'telaVendas', 'telaRelatorio'].forEach((t) => ($(t).hidden = t !== tela));
  const foco = $(tela).querySelector('h2');
  foco.tabIndex = -1; foco.focus(); // leva o foco ao título da nova tela
}

// ---------- Tela 1: login ----------
$('formLogin').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const { token: t, usuario } = await api('/api/login', {
      method: 'POST', body: JSON.stringify({ email: $('email').value, senha: $('senha').value }),
    });
    token = t; sessionStorage.setItem('token', t); sessionStorage.setItem('nome', usuario.nome);
    $('alerta').hidden = true;
    await abrirVendas();
  } catch (err) { avisar(err.message, 'erro'); $('senha').focus(); }
};
function sair() {
  if (token) fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  token = null; sessionStorage.clear(); mostrar('telaLogin');
}
$('btnSair').onclick = sair;

// ---------- Tela 2: vendas ----------
async function abrirVendas() {
  $('nomeOperador').textContent = sessionStorage.getItem('nome');
  produtos = await api('/api/produtos');
  produtos.forEach((p) => (quantidades[p.id] = 0));
  desenharProdutos(); desenharCarrinho(); mostrar('telaVendas');
}
function desenharProdutos() {
  $('listaProdutos').innerHTML = '';
  for (const p of produtos) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.codigo}</td><td>${p.nome}</td><td>${real(p.preco_centavos)}</td>
      <td class="${p.estoque === 0 ? 'sem-estoque' : ''}">${p.estoque} un</td>
      <td><span class="qtd">
        <button type="button" data-d="-1" aria-label="Remover uma unidade de ${p.nome}">−</button>
        <output aria-live="polite" aria-label="Quantidade de ${p.nome}">${quantidades[p.id]}</output>
        <button type="button" data-d="1" aria-label="Adicionar uma unidade de ${p.nome}">+</button>
      </span></td>`;
    tr.querySelectorAll('button').forEach((b) => (b.onclick = () => ajustar(p, Number(b.dataset.d), tr)));
    $('listaProdutos').appendChild(tr);
  }
}
function ajustar(p, d, tr) {
  const nova = quantidades[p.id] + d;
  if (nova < 0) return;
  if (nova > p.estoque) return avisar(`Estoque insuficiente para ${p.nome}.`, 'erro');
  quantidades[p.id] = nova;
  tr.querySelector('output').textContent = nova;
  desenharCarrinho();
}
function itensCarrinho() {
  return produtos.filter((p) => quantidades[p.id] > 0).map((p) => ({ p, qtd: quantidades[p.id] }));
}
function desenharCarrinho() {
  const itens = itensCarrinho();
  $('carrinho').innerHTML = itens.length
    ? itens.map(({ p, qtd }) => `<li><span>${qtd}x ${p.nome}</span><span>${real(p.preco_centavos * qtd)}</span></li>`).join('')
    : '<li class="vazio">Nenhum item adicionado.</li>';
  $('total').textContent = real(totalCarrinho());
  atualizarPagamento();
}

// ---------- Finalização do caixa (v1.1 - feedback da validação) ----------
const NOMES_FORMA = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito' };
const totalCarrinho = () => itensCarrinho().reduce((s, { p, qtd }) => s + p.preco_centavos * qtd, 0);
const formaSelecionada = () => document.querySelector('input[name="forma"]:checked').value;
function lerCentavos(texto) {
  const limpo = String(texto).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return limpo ? Math.round(Number(limpo) * 100) : null;
}
function atualizarPagamento() {
  const total = totalCarrinho();
  const dinheiro = formaSelecionada() === 'dinheiro';
  $('blocoDinheiro').hidden = !dinheiro;
  let podeFinalizar = total > 0;
  if (dinheiro) {
    const recebido = lerCentavos($('valorRecebido').value);
    const troco = $('troco');
    if (recebido == null) { troco.textContent = 'Troco: R$ 0,00 (valor exato)'; troco.classList.remove('falta'); }
    else if (recebido < total) { troco.textContent = `Faltam ${real(total - recebido)}`; troco.classList.add('falta'); podeFinalizar = false; }
    else { troco.textContent = `Troco: ${real(recebido - total)}`; troco.classList.remove('falta'); }
  }
  $('btnFinalizar').disabled = !podeFinalizar;
}
document.querySelectorAll('input[name="forma"]').forEach((r) => (r.onchange = atualizarPagamento));
$('valorRecebido').oninput = atualizarPagamento;
function limparCarrinho() {
  produtos.forEach((p) => (quantidades[p.id] = 0));
  $('valorRecebido').value = '';
  document.querySelector('input[name="forma"][value="dinheiro"]').checked = true;
  desenharProdutos(); desenharCarrinho();
}
// Atalhos de teclado do caixa: F2 finaliza, Esc limpa o carrinho
document.addEventListener('keydown', (e) => {
  if ($('telaVendas').hidden) return;
  if (e.key === 'F2') { e.preventDefault(); if (!$('btnFinalizar').disabled) $('btnFinalizar').click(); }
  if (e.key === 'Escape' && totalCarrinho() > 0) { limparCarrinho(); avisar('Carrinho limpo.', 'ok'); }
});

$('btnFinalizar').onclick = async () => {
  if ($('btnFinalizar').disabled) return;
  $('btnFinalizar').disabled = true; // evita venda duplicada por clique duplo
  try {
    const itens = itensCarrinho().map(({ p, qtd }) => ({ produtoId: p.id, quantidade: qtd }));
    const forma = formaSelecionada();
    const pagamento = { forma, valorRecebidoCentavos: forma === 'dinheiro' ? lerCentavos($('valorRecebido').value) : null };
    const v = await api('/api/vendas', { method: 'POST', body: JSON.stringify({ itens, pagamento }) });
    const { vendaId, totalCentavos } = v;
    $('textoConfirmacao').textContent = `Venda nº ${vendaId} concluída com sucesso! Total: ${real(totalCentavos)}`;
    $('textoPagamento').textContent = v.formaPagamento === 'dinheiro'
      ? `Pagamento: Dinheiro · Recebido ${real(v.valorRecebidoCentavos)} · Troco ${real(v.trocoCentavos)}`
      : `Pagamento: ${NOMES_FORMA[v.formaPagamento]}`;
    $('confirmacao').hidden = false;
    avisar(`Venda nº ${vendaId} registrada. Estoque atualizado.`, 'ok');
    await abrirRelatorio(true);
  } catch (err) { avisar(err.message, 'erro'); atualizarPagamento(); }
};
$('btnRelatorio').onclick = () => abrirRelatorio(false);

// ---------- Tela 3: relatório ----------
async function abrirRelatorio(aposVenda) {
  if (!aposVenda) { $('confirmacao').hidden = true; $('alerta').hidden = true; }
  const r = await api('/api/relatorio');
  $('relData').textContent = new Date(r.data + 'T12:00').toLocaleDateString('pt-BR');
  $('relTransacoes').textContent = `${r.transacoes} ${r.transacoes === 1 ? 'transação' : 'transações'}`;
  $('relFaturamento').textContent = real(r.faturamentoCentavos);
  $('relMaisVendido').textContent = r.maisVendido ? `${r.maisVendido.nome} (${r.maisVendido.quantidade} un)` : '—';
  $('relFormas').innerHTML = r.porFormaPagamento.length
    ? r.porFormaPagamento.map((f) => `<li><span>${NOMES_FORMA[f.forma]} (${f.transacoes})</span><span>${real(f.totalCentavos)}</span></li>`).join('')
    : '<li class="vazio">Nenhuma venda hoje.</li>';
  mostrar('telaRelatorio');
}
$('btnNovaVenda').onclick = () => {
  $('alerta').hidden = true; $('valorRecebido').value = '';
  document.querySelector('input[name="forma"][value="dinheiro"]').checked = true;
  abrirVendas();
};
$('btnImprimir').onclick = () => window.print();

// ---------- Início ----------
aplicarPreferencias();
if (token) abrirVendas().catch(() => mostrar('telaLogin'));
