# ASApp — Atratizzi · Sublipaper App

Sistema da operação de estampa digital em pigmento da Atratizzi (Blumenau/SC), em parceria com a Sublipaper.
Feito a partir do [SApp](https://github.com/fchiesi/sapp-sublipaper): mesma base (Next.js, login Google com papéis,
Google Sheets via Service Account, chat com Claude), com módulos pensados para a Proposta Operacional v6.

## O que tem

| Tela | Para quem | O que faz |
|---|---|---|
| `/painel` | diretoria, administrativo, sócios | Metas do mês: metros faturados × meta e ponto de equilíbrio, preço médio, conversão de amostra, dias de parada da R1, perdas, entregas no prazo, inadimplência, resultado de caixa. Botão **Imprimir relatório** (relatório mensal aos sócios). |
| `/comercial` | vendedor, administrativo, diretoria | Clientes e orçamentos. Preço sugerido por serviço, +20% urgente, aviso de pedido mínimo. Fluxo **orçamento → amostra cobrada (R$ 80) → aprovar → pedido**. |
| `/pedidos` | idem + produção | Pedidos com metros impressos × pedidos, prazo, atraso, status, máquina, NF e **Entregue**. |
| `/producao` | produção (celular) | Metros por Reggiani hoje, **flush** diário, rodada semanal da R2, **apontamento** (pedido, máquina, etapa, metros, perda), **parada** (horas e causa), fila. |
| `/financeiro` | administrativo, diretoria, sócios | Recebido/pago/resultado do mês, a receber/a pagar, inadimplência, 6 meses, lançar gasto/recebimento, marcar pago/recebido. |
| `/chat` | diretoria | Chat com Claude (Opus 5.5) sobre tudo acima, com as mesmas regras das telas. |

Regras automáticas:
- Aprovar orçamento de cliente **novo** cria entrada 50% (vence hoje) e saldo 50% (vence no prazo). O valor da amostra já recebida é descontado.
- Cliente **prazo28** não tem cobrança na aprovação; na entrega nasce o boleto de 28 dias.
- Marcar **entregue** grava a data de entrega e a NF; o saldo passa a vencer hoje.
- Primeiro apontamento de impressão passa o pedido para "em produção" e grava a máquina.
- "Atrasado" e "inadimplente" não são gravados: são calculados (aberto + vencido).

## Papéis

`diretoria` (tudo) · `administrativo` (financeiro, pedidos, metas) · `producao_lider` (pedidos e produção, sem financeiro) ·
`operador` (só produção) · `vendedor` (clientes, orçamentos, pedidos) · `socio` (leitura de tudo, não grava).
Definidos em `ALLOWED_USERS` (ver `.env.local.example`) e em `src/lib/roles.ts`.

## Dados

Uma planilha Google só, **ASApp_Atratizzi**, separada do financeiro da Sublipaper (a proposta pede conta só da operação).
Abas: CLIENTES, ORCAMENTOS, PEDIDOS, APONTAMENTOS, PARADAS, ROTINA, GASTOS, RECEBIMENTOS, METAS, `_LOCK` (oculta).
Linha 1 = cabeçalho; o código lê e grava por **nome de coluna** (`src/lib/planilha.ts`). Toda gravação que acrescenta
linha passa pela trava `_LOCK` (copiada do SApp).

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
  financeiro.ts   gastos, recebimentos, liquidação, resumo
  metas.ts        indicadores do mês
  claude.ts       cliente Claude + prompt
  tools/index.ts  tools do chat (embrulham as funções acima)
  roles.ts auth.ts sheets.ts sheets-lock.ts   (base do SApp)
src/app/(app)/    telas · src/app/api/ rotas · scripts/ setup e teste
```
