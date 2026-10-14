import { atualizar, hojeBR, inserir, lerTabela, noMes, ordinal, somarDias } from "@/lib/planilha";
import { BANCOS, CATEGORIAS_GASTO } from "@/lib/config";
import { exigir, numeroPositivo, texto } from "@/lib/erros";
import { isValidDateBR } from "@/lib/sheets";

/**
 * Financeiro da operacao (Proposta v6, regras financeiras): conta bancaria
 * so da operacao, nada misturado com outras empresas. Por isso a planilha
 * do ASApp e separada do SApp_Financeiro da Sublipaper.
 *
 * Status gravado: aberto | pago (gasto) | recebido (recebimento) | abono.
 * "atrasado" NAO e gravado: e' derivado (aberto + vencimento < hoje).
 */

export interface Lancamento {
  id: string;
  tipo: "gasto" | "recebimento";
  dataVenc: string;
  /** credor (gasto) ou cliente (recebimento) */
  pessoa: string;
  descricao: string;
  categoria: string;
  valor: number;
  status: string;
  atrasado: boolean;
  dataLiquidacao: string;
  pedidoId: string;
  nf: string;
  banco: string;
  obs: string;
}

export async function listarGastos(
  f: { status?: string; mes?: string; credor?: string; categoria?: string } = {},
): Promise<Lancamento[]> {
  const hoje = ordinal(hojeBR());
  let lista: Lancamento[] = (await lerTabela("GASTOS")).map((r) => {
    const status = String(r.STATUS) || "aberto";
    return {
      id: String(r.ID),
      tipo: "gasto" as const,
      dataVenc: String(r.DATA_VENC),
      pessoa: String(r.CREDOR),
      descricao: String(r.DESCRICAO),
      categoria: String(r.CATEGORIA),
      valor: Number(r.VALOR),
      status,
      atrasado: status === "aberto" && ordinal(r.DATA_VENC) > 0 && ordinal(r.DATA_VENC) < hoje,
      dataLiquidacao: String(r.DATA_PGTO),
      pedidoId: "",
      nf: String(r.NF),
      banco: String(r.BANCO),
      obs: String(r.OBS),
    };
  });
  if (f.status === "atrasado") lista = lista.filter((g) => g.atrasado);
  else if (f.status) lista = lista.filter((g) => g.status === f.status);
  if (f.mes) lista = lista.filter((g) => noMes(g.dataVenc, f.mes!));
  if (f.credor) lista = lista.filter((g) => g.pessoa.toLowerCase().includes(f.credor!.toLowerCase()));
  if (f.categoria) lista = lista.filter((g) => g.categoria === f.categoria);
  return lista.sort((a, b) => ordinal(a.dataVenc) - ordinal(b.dataVenc));
}

export async function listarRecebimentos(
  f: { status?: string; mes?: string; cliente?: string; pedidoId?: string } = {},
): Promise<Lancamento[]> {
  const hoje = ordinal(hojeBR());
  let lista: Lancamento[] = (await lerTabela("RECEBIMENTOS")).map((r) => {
    const status = String(r.STATUS) || "aberto";
    return {
      id: String(r.ID),
      tipo: "recebimento" as const,
      dataVenc: String(r.DATA_VENC),
      pessoa: String(r.CLIENTE),
      descricao: [String(r.TIPO), String(r.PEDIDO_ID || r.ORCAMENTO_ID)].filter(Boolean).join(" "),
      categoria: String(r.TIPO),
      valor: Number(r.VALOR),
      status,
      atrasado: status === "aberto" && ordinal(r.DATA_VENC) > 0 && ordinal(r.DATA_VENC) < hoje,
      dataLiquidacao: String(r.DATA_RECEB),
      pedidoId: String(r.PEDIDO_ID),
      nf: String(r.NF),
      banco: String(r.BANCO),
      obs: String(r.OBS),
    };
  });
  if (f.status === "atrasado") lista = lista.filter((g) => g.atrasado);
  else if (f.status) lista = lista.filter((g) => g.status === f.status);
  if (f.mes) lista = lista.filter((g) => noMes(g.dataVenc, f.mes!));
  if (f.cliente) lista = lista.filter((g) => g.pessoa.toLowerCase().includes(f.cliente!.toLowerCase()));
  if (f.pedidoId) lista = lista.filter((g) => g.pedidoId === f.pedidoId);
  return lista.sort((a, b) => ordinal(a.dataVenc) - ordinal(b.dataVenc));
}

function dataOuHoje(v: unknown, campo: string): string {
  const s = texto(v);
  if (!s) return hojeBR();
  exigir(isValidDateBR(s), `${campo} deve ser DD/MM/AAAA.`);
  return s;
}

function bancoValido(v: unknown): string {
  const s = texto(v) || "conta_operacao";
  exigir((BANCOS as readonly string[]).includes(s), `Banco invalido: ${v}.`);
  return s;
}

export interface NovoGasto {
  categoria: string;
  credor: string;
  valor: number;
  dataVenc: string;
  descricao?: string;
  nf?: string;
  pago?: boolean;
  banco?: string;
  obs?: string;
}

export async function lancarGasto(g: NovoGasto, quem: string, origem = "app"): Promise<{ id: string }> {
  const categoria = texto(g.categoria);
  exigir((CATEGORIAS_GASTO as readonly string[]).includes(categoria), `Categoria invalida: ${g.categoria}.`);
  const credor = texto(g.credor);
  exigir(credor, "Credor e obrigatorio.");
  const valor = numeroPositivo(g.valor, "Valor");
  const dataVenc = dataOuHoje(g.dataVenc, "Vencimento");
  return inserir(
    "GASTOS",
    {
      DATA_ENTRADA: hojeBR(),
      DATA_VENC: dataVenc,
      CATEGORIA: categoria,
      CREDOR: credor,
      DESCRICAO: texto(g.descricao),
      NF: texto(g.nf),
      VALOR: valor,
      STATUS: g.pago ? "pago" : "aberto",
      DATA_PGTO: g.pago ? hojeBR() : "",
      BANCO: bancoValido(g.banco),
      OBS: texto(g.obs),
      ORIGEM: origem,
    },
    quem,
  );
}

export interface NovoRecebimento {
  cliente: string;
  valor: number;
  dataVenc: string;
  pedidoId?: string;
  nf?: string;
  obs?: string;
}

export async function lancarRecebimento(r: NovoRecebimento, quem: string, origem = "app"): Promise<{ id: string }> {
  const cliente = texto(r.cliente);
  exigir(cliente, "Cliente e obrigatorio.");
  return inserir(
    "RECEBIMENTOS",
    {
      DATA_EMISSAO: hojeBR(),
      DATA_VENC: dataOuHoje(r.dataVenc, "Vencimento"),
      CLIENTE: cliente,
      PEDIDO_ID: texto(r.pedidoId),
      TIPO: "avulso",
      NF: texto(r.nf),
      VALOR: numeroPositivo(r.valor, "Valor"),
      STATUS: "aberto",
      OBS: texto(r.obs),
      ORIGEM: origem,
    },
    quem,
  );
}

/** Marca gasto pago ou recebimento recebido (data default: hoje). */
export async function liquidar(
  tipo: "gasto" | "recebimento",
  id: string,
  opts: { data?: string; banco?: string } = {},
): Promise<void> {
  const data = dataOuHoje(opts.data, "Data");
  const banco = bancoValido(opts.banco);
  const ok =
    tipo === "gasto"
      ? await atualizar("GASTOS", id, { STATUS: "pago", DATA_PGTO: data, BANCO: banco })
      : await atualizar("RECEBIMENTOS", id, { STATUS: "recebido", DATA_RECEB: data, BANCO: banco });
  exigir(ok, `${tipo === "gasto" ? "Gasto" : "Recebimento"} ${id} nao encontrado.`);
}

export interface ResumoFinanceiro {
  mes: string;
  recebidoMes: number;
  pagoMes: number;
  resultadoCaixaMes: number;
  aReceberAberto: number;
  aPagarAberto: number;
  inadimplencia: { qtd: number; valor: number };
  gastosAtrasados: { qtd: number; valor: number };
  proximos7dias: { pagar: Lancamento[]; receber: Lancamento[] };
  evolucao: { mes: string; faturado: number; recebido: number; gastos_pagos: number }[];
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export async function resumoFinanceiro(mes: string): Promise<ResumoFinanceiro> {
  const [gastos, recebs, pedidos] = await Promise.all([
    listarGastos(),
    listarRecebimentos(),
    lerTabela("PEDIDOS"),
  ]);
  const hoje = hojeBR();
  const o0 = ordinal(hoje);
  const o7 = ordinal(somarDias(hoje, 7));

  const soma = (l: Lancamento[]) => l.reduce((s, x) => s + x.valor, 0);
  const recebidoMes = soma(recebs.filter((r) => r.status === "recebido" && noMes(r.dataLiquidacao, mes)));
  const pagoMes = soma(gastos.filter((g) => g.status === "pago" && noMes(g.dataLiquidacao, mes)));
  const recAtras = recebs.filter((r) => r.atrasado);
  const gasAtras = gastos.filter((g) => g.atrasado);

  // ultimos 6 meses terminando em `mes`
  const [y, m] = mes.split("-").map(Number);
  const evolucao = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    const chave = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      mes: `${MESES[dt.getUTCMonth()]}/${String(dt.getUTCFullYear()).slice(2)}`,
      faturado: pedidos
        .filter((p) => p.STATUS === "entregue" && noMes(p.DATA_ENTREGA, chave))
        .reduce((s, p) => s + Number(p.VALOR_LIQUIDO), 0),
      recebido: soma(recebs.filter((r) => r.status === "recebido" && noMes(r.dataLiquidacao, chave))),
      gastos_pagos: soma(gastos.filter((g) => g.status === "pago" && noMes(g.dataLiquidacao, chave))),
    };
  });

  const naJanela = (l: Lancamento) => l.status === "aberto" && ordinal(l.dataVenc) >= o0 && ordinal(l.dataVenc) <= o7;

  return {
    mes,
    recebidoMes,
    pagoMes,
    resultadoCaixaMes: recebidoMes - pagoMes,
    aReceberAberto: soma(recebs.filter((r) => r.status === "aberto")),
    aPagarAberto: soma(gastos.filter((g) => g.status === "aberto")),
    inadimplencia: { qtd: recAtras.length, valor: soma(recAtras) },
    gastosAtrasados: { qtd: gasAtras.length, valor: soma(gasAtras) },
    proximos7dias: { pagar: gastos.filter(naJanela), receber: recebs.filter(naJanela) },
    evolucao,
  };
}
