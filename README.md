# Sistema de Gestão e Vendas – Itanhaém (MVP)

Projeto de Bloco – Análise e Desenvolvimento de Sistemas.

MVP criado a partir de uma investigação de campo com um comércio varejista local de Itanhaém/SP, que controlava estoque e vendas em cadernos e planilhas desatualizadas. O sistema substitui esse processo manual por um PDV simples: login do operador, venda com baixa automática de estoque e relatório diário.

## Funcionalidades

| Requisito | Descrição |
|---|---|
| RF01 | Registro de vendas com carrinho |
| RF02 | Baixa automática de estoque na mesma transação da venda (com rollback se faltar produto) |
| RF04 | Relatório do dia: nº de vendas, faturamento e item mais vendido |
| RNF01 | Autenticação do operador (senha com hash scrypt) |
| RNF02 | Mensagens de erro tratadas, sem expor detalhes internos |
| RNF03 | Resposta da venda abaixo de 1,5 s (verificado em teste) |

## Ajustes após a validação com a comunidade (v1.1)

Na rodada de validação com o comércio parceiro, o pedido principal foi tornar a **finalização do caixa** mais prática. Ajustes feitos:

- Escolha da forma de pagamento (dinheiro, Pix, débito, crédito)
- Campo "valor recebido" com cálculo do troco em tempo real; o botão só libera quando o valor cobre o total
- Troco recalculado e validado também no servidor, dentro da mesma transação da venda
- Atalhos de teclado: **F2** finaliza a venda, **Esc** limpa o carrinho
- Proteção contra venda duplicada por clique duplo
- Relatório do dia separado por forma de pagamento
- Migração automática do banco: novas colunas `forma_pagamento`, `valor_recebido_centavos` e `troco_centavos` na tabela `vendas`

## Acessibilidade

- Contraste mínimo de 4,5:1 (WCAG 2.1 AA) no tema padrão
- Botão **Alto contraste** (fundo preto, texto branco/amarelo), com a preferência salva
- Botões **A− / A+** para ajustar o tamanho do texto (90% a 150%)
- Navegação completa por teclado (Tab/Enter), link "Pular para o conteúdo" e foco visível
- Alertas com ícone + cor + texto e região `aria-live`, lidos por leitores de tela
- Rótulos (`label`, `aria-label`) em todos os campos e botões

## ODS relacionado

**ODS 8 – Trabalho decente e crescimento econômico** (meta 8.3: apoiar micro e pequenas empresas e sua formalização). O sistema dá a um pequeno comércio local uma ferramenta gratuita de gestão, e os recursos de acessibilidade permitem que pessoas com baixa visão também trabalhem como operadoras de caixa.

## Como executar

Requer Node.js 22.13 ou superior (usa o SQLite nativo `node:sqlite`, sem dependências externas).

```bash
npm start      # abre em http://localhost:3000
npm test       # executa os testes automatizados
```

Usuário de demonstração: `operador@comercio.com` / senha `senha123`.

## Estrutura

```
index.js          servidor HTTP
routes.js         rotas da API e arquivos estáticos
database.js       banco SQLite e regras de negócio
public/           interface (HTML, CSS, JS)
test/             testes automatizados (node:test)
.github/workflows integração contínua (GitHub Actions)
```
