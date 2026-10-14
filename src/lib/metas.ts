import { lerTabela, noMes, ordinal } from "@/lib/planilha";
import { CUSTO_VARIAVEL_M, ehFlush, LIMITES, MAQUINAS, METAS_PADRAO, PRECO_MINIMO_M } from "@/lib/config";
import { resumoFinanceiro } from "@/lib/financeiro";

/**
 * Indicadores do mes (Proposta v6, pagina 6) + base do relatorio mensal aos
 * socios (ate o dia 10: metros, preco medio, faturamento, custo, resultado,
 * caixa, inadimplencia e paradas).
 *
 * Meta do mes: aba METAS (linha com MES = "AAAA-MM"). Sem linha, usa o plano
 * comercial padrao contando a partir de INICIO_OPERACAO.
 */

/** Primeiro mes da operacao (mes 1 do plano). Ajuste quando a data fechar. */
export const INICIO_OPERACAO = "2026-11";

export type Situacao = "ok" | "alerta" | "atencao" | "sem_dado";

export interface Indicador {
  chave: string;
  nome: string;
  valor: number | null;
  /** como mostrar: brl, metros, pct, horas, dias, numero */
  formato: "brl" | "metros" | "pct" | "dias" | "numero";
  meta: string;
  situacao: Situacao;
}

export interface Indicadores {
  mes: string;
  mesDaOperacao: number | null;
  meta: { metros: number; precoMedio: number; custoFixo: number; origem: "planilha" | "padrao" };
  indicadores: Indicador[];
  producao: {
    maquina: string;
    metrosImpressos: number;
    diasParados: number;
    horasParadas: number;
    flushes: number;
    flushesEntupimento: number;
  }[];
  paradasPorCausa: { causa: string; horas: number }[];
  financeiro: {
    faturamento: number;
    recebido: number;
    pago: number;
    resultadoCaixa: number;
    aReceber: number;
    aPagar: number;
    inadimplente: number;
  };
  pontoEquilibrioMetros: number;
}

function mesesEntre(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

async function metaDoMes(mes: string): Promise<Indicadores["meta"] & { mesDaOperacao: number | null }> {
  const n = mesesEntre(INICIO_OPERACAO, mes) + 1;
  const mesDaOperacao = n >= 1 ? n : null;
  const linha = (await lerTabela("METAS")).find((r) => String(r.MES) === mes);
  const plano = METAS_PADRAO.metrosPorMesDaOperacao;
  const metrosPadrao = mesDaOperacao ? plano[Math.min(mesDaOperacao, plano.length) - 1] : 0;
  const custoPadrao = mesDaOperacao && mesDaOperacao >= 7 ? METAS_PADRAO.custoFixoFase2 : METAS_PADRAO.custoFixoFase1;
  if (linha) {
    return {
      metros: Number(linha.METROS_META) || metrosPadrao,
      precoMedio: Number(linha.PRECO_MEDIO_META) || METAS_PADRAO.precoMedio,
      custoFixo: Number(linha.CUSTO_FIXO) || custoPadrao,
      origem: "planilha",
      mesDaOperacao,
    };
  }
  return { metros: metrosPadrao, precoMedio: METAS_PADRAO.precoMedio, custoFixo: custoPadrao, origem: "padrao", mesDaOperacao };
}

const pct = (a: number, b: number) => (b > 0 ? a / b : null);

export async function indicadoresDoMes(mes: string): Promise<Indicadores> {
  const [meta, pedidos, orcs, aptos, paradas, rotina, fin] = await Promise.all([
    metaDoMes(mes),
    lerTabela("PEDIDOS"),
    lerTabela("ORCAMENTOS"),
    lerTabela("APONTAMENTOS"),
    lerTabela("PARADAS"),
    lerTabela("ROTINA"),
    resumoFinanceiro(mes),
  ]);

  const entregues = pedidos.filter((p) => p.STATUS === "entregue" && noMes(p.DATA_ENTREGA, mes));
  const metrosFat = entregues.reduce((s, p) => s + Number(p.METROS), 0);
  const valorBruto = entregues.reduce((s, p) => s + Number(p.VALOR), 0);
  const faturamento = entregues.reduce((s, p) => s + Number(p.VALOR_LIQUIDO), 0);
  const precoMedio = metrosFat > 0 ? valorBruto / metrosFat : null;
  const noPrazo = entregues.filter((p) => !ordinal(p.PRAZO) || ordinal(p.DATA_ENTREGA) <= ordinal(p.PRAZO)).length;

  const amostras = orcs.filter((o) => Number(o.AMOSTRA_VALOR) > 0 && noMes(o.AMOSTRA_DATA, mes));
  const convertidas = amostras.filter((o) => o.STATUS === "pedido").length;
  // amostra do mes ainda em aberto nao conta como perdida: so as decididas
  const decididas = amostras.filter((o) => o.STATUS !== "amostra").length;

  const aptosMes = aptos.filter((a) => noMes(a.DATA_HORA, mes));
  const metrosApontados = aptosMes.reduce((s, a) => s + Number(a.METROS), 0);
  const perda = aptosMes.reduce((s, a) => s + Number(a.PERDA_M), 0);

  const paradasMes = paradas.filter((p) => noMes(p.DATA, mes));
  const flushMes = rotina.filter((r) => ehFlush(r.TIPO) && noMes(r.DATA_HORA, mes));
  const producao = MAQUINAS.map((m) => {
    const pm = paradasMes.filter((p) => p.MAQUINA === m);
    const fm = flushMes.filter((r) => r.MAQUINA === m);
    return {
      maquina: m,
      metrosImpressos: aptosMes
        .filter((a) => a.MAQUINA === m && a.ETAPA === "impressao")
        .reduce((s, a) => s + Number(a.METROS), 0),
      diasParados: new Set(pm.map((p) => String(p.DATA))).size,
      horasParadas: pm.reduce((s, p) => s + Number(p.HORAS), 0),
      flushes: fm.length,
      flushesEntupimento: fm.filter((r) => r.TIPO === "flush_entupimento").length,
    };
  });
  const causas = new Map<string, number>();
  for (const p of paradasMes) causas.set(String(p.CAUSA), (causas.get(String(p.CAUSA)) ?? 0) + Number(p.HORAS));

  const r1 = producao.find((p) => p.maquina === "R1")!;
  const taxaMeta = pct(metrosFat, meta.metros);
  const conversao = pct(convertidas, decididas);
  const perdaPct = pct(perda, metrosApontados + perda);
  const prazoPct = pct(noPrazo, entregues.length);
  const inadPct = pct(fin.inadimplencia.valor, faturamento);

  const sit = (v: number | null, bomSe: (x: number) => boolean, alertaSe: (x: number) => boolean): Situacao =>
    v === null ? "sem_dado" : alertaSe(v) ? "alerta" : bomSe(v) ? "ok" : "atencao";

  const indicadores: Indicador[] = [
    {
      chave: "metros",
      nome: "Metros faturados",
      valor: metrosFat,
      formato: "metros",
      meta: `${meta.metros.toLocaleString("pt-BR")} m`,
      situacao: meta.metros
        ? sit(taxaMeta, (x) => x >= 1, (x) => x < LIMITES.metaMetrosAlerta)
        : "sem_dado",
    },
    {
      chave: "preco_medio",
      nome: "Preco medio por metro",
      valor: precoMedio,
      formato: "brl",
      meta: `R$ ${meta.precoMedio} ou mais`,
      situacao: sit(precoMedio, (x) => x >= meta.precoMedio, (x) => x < PRECO_MINIMO_M),
    },
    {
      chave: "conversao",
      nome: "Conversao de amostra em pedido",
      valor: conversao,
      formato: "pct",
      meta: "30% ou mais",
      situacao: sit(conversao, (x) => x >= LIMITES.conversaoAmostraMeta, (x) => x < LIMITES.conversaoAmostraAlerta),
    },
    {
      chave: "paradas_r1",
      nome: "Dias de parada da Reggiani 1",
      valor: r1.diasParados,
      formato: "dias",
      meta: "registrar todos; alerta acima de 3",
      situacao: r1.diasParados > LIMITES.diasParadaAlerta ? "alerta" : "ok",
    },
    {
      chave: "perdas",
      nome: "Perdas de material",
      valor: perdaPct,
      formato: "pct",
      meta: "ate 5%",
      situacao: sit(perdaPct, (x) => x <= LIMITES.perdaMeta, (x) => x > LIMITES.perdaAlerta),
    },
    {
      chave: "prazo",
      nome: "Entregas no prazo",
      valor: prazoPct,
      formato: "pct",
      meta: "95%",
      situacao: sit(prazoPct, (x) => x >= LIMITES.prazoMeta, (x) => x < LIMITES.prazoAlerta),
    },
    {
      chave: "inadimplencia",
      nome: "Inadimplencia (sobre o faturamento)",
      valor: inadPct,
      formato: "pct",
      meta: "ate 3%",
      situacao: sit(inadPct, (x) => x <= LIMITES.inadimplenciaMeta, (x) => x > LIMITES.inadimplenciaAlerta),
    },
    {
      chave: "resultado",
      nome: "Resultado de caixa do mes",
      valor: fin.resultadoCaixaMes,
      formato: "brl",
      meta: "positivo a partir do mes 5",
      situacao:
        fin.recebidoMes === 0 && fin.pagoMes === 0
          ? "sem_dado"
          : fin.resultadoCaixaMes >= 0
            ? "ok"
            : meta.mesDaOperacao && meta.mesDaOperacao >= 6
              ? "alerta"
              : "atencao",
    },
  ];

  return {
    mes,
    mesDaOperacao: meta.mesDaOperacao,
    meta: { metros: meta.metros, precoMedio: meta.precoMedio, custoFixo: meta.custoFixo, origem: meta.origem },
    indicadores,
    producao,
    paradasPorCausa: [...causas.entries()].map(([causa, horas]) => ({ causa, horas })).sort((a, b) => b.horas - a.horas),
    financeiro: {
      faturamento,
      recebido: fin.recebidoMes,
      pago: fin.pagoMes,
      resultadoCaixa: fin.resultadoCaixaMes,
      aReceber: fin.aReceberAberto,
      aPagar: fin.aPagarAberto,
      inadimplente: fin.inadimplencia.valor,
    },
    // metros para empatar: custo fixo / margem por metro (preco - custo variavel)
    pontoEquilibrioMetros: Math.ceil(
      meta.custoFixo / Math.max((precoMedio ?? meta.precoMedio) - CUSTO_VARIAVEL_M, 0.01),
    ),
  };
}
