# ASApp — Atratizzi · Sublipaper App

Sistema da operação de estampa digital em pigmento da Atratizzi (Blumenau/SC), em parceria com a Sublipaper.
Feito a partir do [SApp](https://github.com/fchiesi/sapp-sublipaper): mesma base (Next.js, login Google com papéis,
Google Sheets via Service Account, chat com Claude), com módulos pensados para a Proposta Operacional v6.

## O que tem

| Tela | Para quem | O que faz |
|---|---|---|
| `/painel` | diretoria, administrativo, sócios | Metas do mês: metros faturados × meta e ponto de equilíbrio, preço médio, conversão de amostra, perdas, entregas no prazo, inadimplência, resultado de caixa. Botão **Imprimir relatório** (relatório mensal aos sócios). |
| `/comercial` | vendedor, administrativo, diretoria | Clientes (cadastro curto: nome, telefone, pagamento; o resto em "Mais dados") e orçamentos. Orçamento e pedido têm **+ Novo** para cadastrar o cliente sem sair da tela. Preço sugerido por serviço, +20% urgente, aviso de pedido mínimo. Fluxo **orçamento → amostra cobrada (R$ 80) → aprovar → pedido**. |
| `/pedidos` | idem + produção | **Novo pedido** no modelo do SApp: nº do pedido do cliente, entrega, pagamento (50/50, 28, 30/60/90), representante e **uma linha por desenho**. Lista com metros impressos × pedidos, prazo, atraso, status, máquina, NF e **Entregue**. |
| `/producao` | produção (celular) | Metros por Reggiani hoje, **flush** com motivo (troca de tinta ou entupimento - não é diário) e último flush, rodada semanal da R2, **apontamento** (pedido, máquina, etapa, metros, perda), **parada** (horas e causa), fila. |
| `/estoque` | produção, administrativo, diretoria (sócios leem) | Tintas, tecidos próprios, tecido do cliente e insumos: saldo (soma dos movimentos) com alerta de mínimo, **entrada** (com opção de lançar a conta a pagar), **saída/consumo** (tinta por máquina), **ajuste de inventário** (informa o saldo contado), cadastro de item. |
| `/financeiro` | administrativo, diretoria, sócios | Recebido/pago/resultado do mês, a receber/a pagar, inadimplência, 6 meses, lançar gasto/recebimento, marcar pago/recebido. |
| `/chat` | diretoria | Chat com Claude (Opus 5.5) sobre tudo acima, com as mesmas regras das telas. |

Regras automáticas:
- Aprovar orçamento de cliente **novo** cria entrada 50% (vence hoje) e saldo 50% (vence no prazo). O valor da amostra já recebida é descontado.
- Pedido = várias linhas (desenhos) com o mesmo **nº do pedido**; o financeiro é sobre o pedido inteiro.
- Pagamento **50/50**: entrada e saldo nascem na aprovação/entrada do pedido. Pagamento por **dias** ("28", "30/60/90"): as parcelas nascem quando o **último desenho** é entregue.
- Marcar **entregue** grava a data de entrega e a NF; no 50/50 o saldo passa a vencer hoje.
- Entrada de **tecido do cliente** informando o pedido passa os desenhos de "aguardando tecido" para "na fila".
- Primeiro apontamento de impressão passa o pedido para "em produção" e grava a máquina.
- "Atrasado" e "inadimplente" não são gravados: são calculados (aberto + vencido).

## Papéis

`diretoria` (tudo) · `administrativo` (financeiro, pedidos, metas) · `producao_lider` (pedidos e produção, sem financeiro) ·
`operador` (só produção) · `vendedor` (clientes, orçamentos, pedidos) · `socio` (leitura de tudo, não grava).
Definidos em `ALLOWED_USERS` (ver `.env.local.example`) e em `src/lib/roles.ts`.

## Dados

Uma planilha Google só, **ASApp_Atratizzi**, separada do financeiro da Sublipaper (a proposta pede conta só da operação).
Abas: CLIENTES, ORCAMENTOS, PEDIDOS, APONTAMENTOS, PARADAS, ROTINA, ITENS_ESTOQUE, MOV_ESTOQUE, GASTOS, RECEBIMENTOS, METAS, `_LOCK` (oculta).
Linha 1 = cabeçalho; o código lê e grava por **nome de coluna** (`src/lib/planilha.ts`). Toda gravação que acrescenta
linha passa pela trava `_LOCK` (copiada do SApp).

**Controle Atratizzi** (pasta `ASapp` no Drive, id `1DwcZRJfFDc5gg_g6JlHnZCnkTqrPQ8tISup6dyGlbPk`): planilha só de
consulta para Costa, Junior, Fernando e contador - Resumo (situação de hoje + mês a mês), Pedidos, Faturamento,
Recebimentos, Gastos. Puxa PEDIDOS/GASTOS/RECEBIMENTOS por IMPORTRANGE + QUERY **pela letra da coluna**: coluna nova
nas abas do app vai sempre no FIM (inserir no meio desloca as letras e quebra o controle).

Preços, mínimos, metas e limites de alerta: `src/lib/config.ts`. Meta de cada mês: aba METAS (sem linha, usa o plano
padrão a partir de `INICIO_OPERACAO` em `src/lib/metas.ts`, hoje `2026-11`).

## Rodar

```bash
npm install
cp .env.local.example .env.local   # preencher
npx tsx scripts/setup-planilha.ts  # cria abas/cabeçalhos na planilha (idempotente)
npm run dev
```

## Testes

```bash
npx tsx scripts/test-fluxo.ts   # fluxo inteiro contra planilha em memória (~30 s)
npm run typecheck && npm run lint && npm run build
```

## Estrutura

```
src/lib/
  config.ts       regras de negócio (serviços, preços, mínimos, metas, alertas)
  planilha.ts     esquema das abas + ler/inserir/atualizar por nome de coluna
  comercial.ts    clientes, orçamentos, amostra, aprovação, pedidos, entrega
  producao.ts     apontamento, paradas, flush, painel do dia
  estoque.ts      itens, movimentos, saldo, consumo de tinta
  financeiro.ts   gastos, recebimentos, liquidação, resumo
  metas.ts        indicadores do mês
  claude.ts       cliente Claude + prompt
  tools/index.ts  tools do chat (embrulham as funções acima)
  roles.ts auth.ts sheets.ts sheets-lock.ts   (base do SApp)
src/app/(app)/    telas · src/app/api/ rotas · scripts/ setup e teste
```
