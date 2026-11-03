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
