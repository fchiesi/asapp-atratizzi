/**
 * Regras de negocio da operacao Atratizzi.
 *
 * Fonte: Proposta_Operacional_Parceria_v6 (out/2026) e planilha
 * Custo_por_metro_Atratizzi v4. Precos e metas sao estimativas a validar
 * com os primeiros clientes - mude aqui (ou na aba METAS) quando fecharem.
 *
 * Arquivo sem dependencia de servidor: telas (client) tambem usam.
 */

export const EMPRESA = {
  nome: "Atratizzi",
  razao: "Atratizzi Comercio de Tecidos Ltda",
  cidade: "Blumenau/SC",
} as const;

export const MAQUINAS = ["R1", "R2"] as const;
export type Maquina = (typeof MAQUINAS)[number];
export const MAQUINA_LABEL: Record<Maquina, string> = {
  R1: "Reggiani 1",
  R2: "Reggiani 2",
};

export interface Servico {
  id: string;
  nome: string;
  /** preco-alvo por metro (R$); 0 = cobrado por unidade */
  precoM: number;
  /** faixa da proposta, so pra mostrar */
  faixa: string;
  minPorEstampa: number;
  minPorPedido: number;
  /** prazo em dias uteis */
  prazoDias: number;
}

export const SERVICOS: readonly Servico[] = [
  {
    id: "pigmento",
    nome: "Estampa digital em pigmento (tecido do cliente)",
    precoM: 18,
    faixa: "R$ 17 a 19/m; R$ 14-15 so com contrato de volume",
    minPorEstampa: 5,
    minPorPedido: 30,
    prazoDias: 7,
  },
  {
    id: "tiragem_curta",
    nome: "Tiragem curta com prova de cor",
    precoM: 25,
    faixa: "R$ 22 a 28/m + prova",
    minPorEstampa: 5,
    minPorPedido: 5,
    prazoDias: 7,
  },
  {
    id: "tecido_estampado",
    nome: "Tecido estampado sob demanda (tecido + estampa)",
    precoM: 47,
    faixa: "R$ 40 a 55/m",
    minPorEstampa: 0,
    minPorPedido: 10,
    prazoDias: 10,
  },
  {
    id: "colecao_propria",
    nome: "Colecao propria",
    precoM: 52,
    faixa: "R$ 45 a 60/m",
    minPorEstampa: 0,
    minPorPedido: 1,
    prazoDias: 5,
  },
];

export function servicoPorId(id: string): Servico | undefined {
  return SERVICOS.find((s) => s.id === id);
}

export const TECIDOS = ["tricoline", "viscose", "linho", "algodao", "poliester", "outro"] as const;

/** Amostra cobrada: o valor volta como desconto no primeiro pedido. */
export const VALOR_AMOSTRA = 80;
/** Pedido urgente (48-72 h): +20% no preco. */
export const ACRESCIMO_URGENTE = 0.2;
/** Abaixo disso o painel acende alerta de preco. */
export const PRECO_MINIMO_M = 16;

/**
 * Condicao de pagamento:
 * - novo: 50% na aprovacao da amostra + 50% na entrega
 * - prazo28: boleto em 28 dias (so depois de 3 pedidos em dia)
 */
export const CONDICOES = ["novo", "prazo28"] as const;
export type Condicao = (typeof CONDICOES)[number];
export const CONDICAO_LABEL: Record<Condicao, string> = {
  novo: "50% na aprovacao + 50% na entrega",
  prazo28: "Boleto 28 dias",
};

export const STATUS_ORCAMENTO = ["aberto", "amostra", "aprovado", "perdido", "pedido"] as const;
export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number];

export const STATUS_PEDIDO = [
  "aguardando_tecido",
  "na_fila",
  "em_producao",
  "acabamento",
  "pronto",
  "entregue",
  "cancelado",
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];
export const STATUS_PEDIDO_LABEL: Record<StatusPedido, string> = {
  aguardando_tecido: "Aguardando tecido",
  na_fila: "Na fila",
  em_producao: "Em producao",
  acabamento: "Acabamento",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/** Etapas apontadas na producao (fluxo do pedido, pagina 5 da proposta). */
export const ETAPAS = ["preparo", "impressao", "polimerizacao", "acabamento"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const CAUSAS_PARADA = [
  "cabeca",
  "manutencao",
  "falta_pedido",
  "falta_tecido",
  "energia_ar",
  "outro",
] as const;
export const CAUSA_LABEL: Record<(typeof CAUSAS_PARADA)[number], string> = {
  cabeca: "Cabeca de impressao",
  manutencao: "Manutencao",
  falta_pedido: "Falta de pedido",
  falta_tecido: "Falta de tecido",
  energia_ar: "Energia / ar comprimido",
  outro: "Outro",
};

/** Rotina diaria das maquinas (flush) e semanal (R2 roda 1x por semana). */
export const TIPOS_ROTINA = ["flush", "limpeza", "rodada_semanal"] as const;

export const CATEGORIAS_GASTO = [
  "salario",
  "pro_labore",
  "comissao",
  "tinta",
  "tecido",
  "pre_tratamento",
  "pecas_cabecas",
  "manutencao",
  "energia",
  "aluguel",
  "taxa_uso_r2",
  "acordo_divida_r1",
  "frete",
  "imposto",
  "contador",
  "marketing",
  "investimento",
  "outros",
] as const;

export const BANCOS = ["conta_operacao", "dinheiro", "cartao"] as const;

/**
 * Metas padrao quando a aba METAS nao tem o mes (plano comercial dos 6
 * primeiros meses + meta do mes 12). Mes 1 = primeiro mes da operacao.
 */
export const METAS_PADRAO = {
  precoMedio: 17,
  custoFixoFase1: 50_500,
  custoFixoFase2: 56_000,
  metrosPorMesDaOperacao: [4000, 4000, 5500, 5500, 7500, 8000, 8000, 8000, 8000, 9000, 10000, 12000],
} as const;

/** Indicadores da proposta (pagina 6): meta e alerta. */
export const LIMITES = {
  conversaoAmostraMeta: 0.3,
  conversaoAmostraAlerta: 0.15,
  diasParadaAlerta: 3,
  perdaMeta: 0.05,
  perdaAlerta: 0.08,
  prazoMeta: 0.95,
  prazoAlerta: 0.85,
  inadimplenciaMeta: 0.03,
  inadimplenciaAlerta: 0.05,
  metaMetrosAlerta: 0.7,
} as const;

/** Preco por metro sugerido (com urgencia). */
export function precoSugerido(servicoId: string, urgente: boolean): number {
  const s = servicoPorId(servicoId);
  if (!s) return 0;
  const p = s.precoM * (urgente ? 1 + ACRESCIMO_URGENTE : 1);
  return Math.round(p * 100) / 100;
}

/** Avisos de pedido minimo (nao bloqueia: decisao comercial). */
export function avisosMinimo(servicoId: string, metros: number, estampas: number): string[] {
  const s = servicoPorId(servicoId);
  if (!s) return [];
  const avisos: string[] = [];
  if (s.minPorPedido && metros < s.minPorPedido) {
    avisos.push(`Abaixo do minimo de ${s.minPorPedido} m por pedido.`);
  }
  if (s.minPorEstampa && estampas > 0 && metros / estampas < s.minPorEstampa) {
    avisos.push(`Abaixo do minimo de ${s.minPorEstampa} m por estampa.`);
  }
  return avisos;
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function metrosFmt(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`;
}
