import { agoraBR, atualizar, inserir, lerTabela, noMes } from "@/lib/planilha";
import { MAQUINAS, TIPOS_ITEM, TIPOS_MOV, UNIDADES_ESTOQUE, type TipoItem, type TipoMov } from "@/lib/config";
import { exigir, numeroPositivo, texto } from "@/lib/erros";
import { listarPedidos } from "@/lib/comercial";
import { lancarGasto } from "@/lib/financeiro";
import { isValidDateBR } from "@/lib/sheets";

/**
 * Estoque de tintas, tecidos e insumos.
 *
 * Aba ITENS_ESTOQUE = cadastro (com estoque minimo). Aba MOV_ESTOQUE = todo
 * movimento: entrada (+), saida (-) e ajuste (diferenca do inventario, com
 * sinal). O saldo NUNCA e gravado: e a soma dos movimentos - assim nao ha
 * saldo que desencontre do historico.
 *
 * Entrada de tecido do cliente ligada a um pedido libera as linhas do pedido
 * que estavam "aguardando tecido" para "na fila".
 */

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export interface ItemEstoque {
  id: string;
  tipo: TipoItem;
  nome: string;
  cor: string;
  unidade: string;
  larguraM: number;
  fornecedor: string;
  minimo: number;
  custoUnit: number;
  ativo: boolean;
  obs: string;
  saldo: number;
  abaixoMinimo: boolean;
  /** valor do saldo a custo (tecido do cliente = 0, nao e nosso) */
  valorSaldo: number;
}

export interface Movimento {
  id: string;
  dataHora: string;
  itemId: string;
  item: string;
  tipoMov: TipoMov;
  quantidade: number;
  custoUnit: number;
  valor: number;
  fornecedor: string;
  nf: string;
  pedido: string;
  maquina: string;
  lote: string;
  operador: string;
  obs: string;
}

function sinal(tipo: string, qtd: number): number {
  return tipo === "saida" ? -qtd : qtd;
}

export async function listarMovimentos(f: { itemId?: string; mes?: string } = {}): Promise<Movimento[]> {
  let lista: Movimento[] = (await lerTabela("MOV_ESTOQUE")).map((r) => ({
    id: String(r.ID),
    dataHora: String(r.DATA_HORA),
    itemId: String(r.ITEM_ID),
    item: String(r.ITEM),
    tipoMov: String(r.TIPO_MOV) as TipoMov,
    quantidade: Number(r.QUANTIDADE),
    custoUnit: Number(r.CUSTO_UNIT),
    valor: Number(r.VALOR),
    fornecedor: String(r.FORNECEDOR),
    nf: String(r.NF),
    pedido: String(r.PEDIDO),
    maquina: String(r.MAQUINA),
    lote: String(r.LOTE),
    operador: String(r.OPERADOR),
    obs: String(r.OBS),
  }));
  if (f.itemId) lista = lista.filter((m) => m.itemId === f.itemId);
  if (f.mes) lista = lista.filter((m) => noMes(m.dataHora, f.mes!));
  // a aba so e acrescentada: mais recente por ultimo -> inverte
  return lista.reverse();
}

export async function listarItens(f: { tipo?: string; inativos?: boolean } = {}): Promise<ItemEstoque[]> {
  const [itens, movs] = await Promise.all([lerTabela("ITENS_ESTOQUE"), lerTabela("MOV_ESTOQUE")]);
  const saldos = new Map<string, number>();
  for (const m of movs) {
    const k = String(m.ITEM_ID);
    saldos.set(k, (saldos.get(k) ?? 0) + sinal(String(m.TIPO_MOV), Number(m.QUANTIDADE)));
  }
  let lista: ItemEstoque[] = itens.map((r) => {
    const tipo = ((TIPOS_ITEM as readonly string[]).includes(String(r.TIPO)) ? r.TIPO : "insumo") as TipoItem;
    const saldo = r3(saldos.get(String(r.ID)) ?? 0);
    const minimo = Number(r.ESTOQUE_MINIMO);
    const custoUnit = Number(r.CUSTO_UNIT);
    return {
      id: String(r.ID),
      tipo,
      nome: String(r.NOME),
      cor: String(r.COR),
      unidade: String(r.UNIDADE),
      larguraM: Number(r.LARGURA_M),
      fornecedor: String(r.FORNECEDOR),
      minimo,
      custoUnit,
      ativo: String(r.ATIVO) !== "N",
      obs: String(r.OBS),
      saldo,
      abaixoMinimo: minimo > 0 && saldo < minimo,
      valorSaldo: tipo === "tecido_cliente" ? 0 : Math.max(saldo, 0) * custoUnit,
    };
  });
  if (!f.inativos) lista = lista.filter((i) => i.ativo);
  if (f.tipo) lista = lista.filter((i) => i.tipo === f.tipo);
  const ordem = (t: TipoItem) => TIPOS_ITEM.indexOf(t);
  return lista.sort((a, b) => ordem(a.tipo) - ordem(b.tipo) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface NovoItem {
  tipo: string;
  nome: string;
  cor?: string;
  unidade?: string;
  larguraM?: number;
  fornecedor?: string;
  minimo?: number;
  custoUnit?: number;
  obs?: string;
}

export async function criarItem(i: NovoItem, quem: string): Promise<{ id: string }> {
  const tipo = texto(i.tipo);
  exigir((TIPOS_ITEM as readonly string[]).includes(tipo), `Tipo invalido: ${i.tipo}.`);
  const nome = texto(i.nome);
  exigir(nome, "Nome do item e obrigatorio.");
  const unidade = texto(i.unidade) || (tipo === "tinta" ? "L" : tipo === "insumo" ? "un" : "m");
  exigir((UNIDADES_ESTOQUE as readonly string[]).includes(unidade), `Unidade invalida: ${unidade}.`);
  const existentes = await lerTabela("ITENS_ESTOQUE", { fresco: true });
  exigir(
    !existentes.some((r) => String(r.NOME).toLowerCase() === nome.toLowerCase()),
    `Ja existe item com o nome "${nome}".`,
  );
  return inserir(
    "ITENS_ESTOQUE",
    {
      TIPO: tipo,
      NOME: nome,
      COR: texto(i.cor),
      UNIDADE: unidade,
      LARGURA_M: Number(i.larguraM) || "",
      FORNECEDOR: texto(i.fornecedor),
      ESTOQUE_MINIMO: Number(i.minimo) || 0,
      CUSTO_UNIT: Number(i.custoUnit) || 0,
      ATIVO: "S",
      OBS: texto(i.obs),
    },
    quem,
  );
}

export async function alterarItem(
  id: string,
  alt: { minimo?: number; custoUnit?: number; fornecedor?: string; ativo?: boolean; obs?: string },
): Promise<void> {
  const patch: Record<string, string | number> = {};
  if (alt.minimo !== undefined) patch.ESTOQUE_MINIMO = Math.max(0, Number(alt.minimo) || 0);
  if (alt.custoUnit !== undefined) patch.CUSTO_UNIT = Math.max(0, Number(alt.custoUnit) || 0);
  if (alt.fornecedor !== undefined) patch.FORNECEDOR = texto(alt.fornecedor);
  if (alt.ativo !== undefined) patch.ATIVO = alt.ativo ? "S" : "N";
  if (alt.obs !== undefined) patch.OBS = texto(alt.obs);
  exigir(await atualizar("ITENS_ESTOQUE", id, patch), `Item ${id} nao encontrado.`);
}

export interface NovoMovimento {
  itemId: string;
  tipoMov: string;
  /** entrada/saida: quantidade movimentada. ajuste: SALDO CONTADO no inventario */
  quantidade: number;
  custoUnit?: number;
  fornecedor?: string;
  nf?: string;
  /** pedido (numero ou linha) - saida de tecido/tinta ou tecido do cliente */
  pedido?: string;
  maquina?: string;
  lote?: string;
  obs?: string;
  /** entrada com custo: tambem lanca a conta a pagar com este vencimento */
  vencimentoGasto?: string;
}

export interface ResultadoMovimento {
  id: string;
  saldo: number;
  avisos: string[];
  gastoId?: string;
  pedidosLiberados: string[];
}

export async function movimentar(m: NovoMovimento, quem: string): Promise<ResultadoMovimento> {
  const itens = await listarItens({ inativos: true });
  const item = itens.find((i) => i.id === texto(m.itemId));
  exigir(item, `Item ${m.itemId} nao encontrado.`);
  exigir(item.ativo, `Item ${item.nome} esta inativo.`);
  const tipoMov = texto(m.tipoMov) as TipoMov;
  exigir((TIPOS_MOV as readonly string[]).includes(tipoMov), `Movimento invalido: ${m.tipoMov}.`);
  const maquina = texto(m.maquina).toUpperCase();
  exigir(!maquina || (MAQUINAS as readonly string[]).includes(maquina), `Maquina invalida: ${m.maquina}.`);

  const avisos: string[] = [];
  let quantidade: number;
  if (tipoMov === "ajuste") {
    const contado = Number(String(m.quantidade).replace(",", "."));
    exigir(Number.isFinite(contado) && contado >= 0, "Saldo contado deve ser um numero (0 ou mais).");
    quantidade = r3(contado - item.saldo);
    exigir(quantidade !== 0, `O saldo de ${item.nome} ja e ${item.saldo} ${item.unidade}; nada a ajustar.`);
  } else {
    quantidade = numeroPositivo(m.quantidade, "Quantidade");
  }
  if (tipoMov === "saida" && quantidade > item.saldo) {
    avisos.push(`Saida maior que o saldo (${item.saldo} ${item.unidade}): o saldo fica negativo. Confira ou faca um ajuste.`);
  }

  const custoUnit = tipoMov === "entrada" && item.tipo !== "tecido_cliente" ? Number(m.custoUnit) || item.custoUnit : item.custoUnit;
  const valor = Math.round(Math.abs(quantidade) * custoUnit * 100) / 100;
  const pedido = texto(m.pedido);

  const { id } = await inserir(
    "MOV_ESTOQUE",
    {
      DATA_HORA: agoraBR(),
      ITEM_ID: item.id,
      ITEM: item.nome,
      TIPO_MOV: tipoMov,
      QUANTIDADE: quantidade,
      CUSTO_UNIT: custoUnit,
      VALOR: item.tipo === "tecido_cliente" ? 0 : valor,
      FORNECEDOR: texto(m.fornecedor) || (tipoMov === "entrada" ? item.fornecedor : ""),
      NF: texto(m.nf),
      PEDIDO: pedido,
      MAQUINA: maquina,
      LOTE: texto(m.lote),
      OPERADOR: quem,
      OBS: texto(m.obs),
    },
    quem,
  );

  // entrada com preco novo atualiza o custo do cadastro (base do valor do estoque)
  if (tipoMov === "entrada" && item.tipo !== "tecido_cliente" && Number(m.custoUnit) > 0 && Number(m.custoUnit) !== item.custoUnit) {
    await atualizar("ITENS_ESTOQUE", item.id, { CUSTO_UNIT: Number(m.custoUnit) });
  }

  let gastoId: string | undefined;
  if (tipoMov === "entrada" && m.vencimentoGasto) {
    exigir(item.tipo !== "tecido_cliente", "Tecido do cliente nao gera conta a pagar.");
    exigir(isValidDateBR(m.vencimentoGasto), "Vencimento da conta deve ser DD/MM/AAAA.");
    exigir(valor > 0, "Para lancar a conta a pagar informe o custo unitario.");
    const fornecedor = texto(m.fornecedor) || item.fornecedor;
    exigir(fornecedor, "Para lancar a conta a pagar informe o fornecedor.");
    const r = await lancarGasto(
      {
        categoria: item.tipo === "tinta" ? "tinta" : item.tipo === "tecido" ? "tecido" : "outros",
        credor: fornecedor,
        valor,
        dataVenc: m.vencimentoGasto,
        descricao: `${quantidade} ${item.unidade} ${item.nome}`,
        nf: texto(m.nf),
        obs: `Entrada de estoque ${id}`,
      },
      quem,
    );
    gastoId = r.id;
  }

  const pedidosLiberados: string[] = [];
  if (tipoMov === "entrada" && item.tipo === "tecido_cliente" && pedido) {
    const linhas = (await listarPedidos()).filter(
      (p) => (p.id === pedido || p.pedCli === pedido) && p.status === "aguardando_tecido",
    );
    if (linhas.length === 0) avisos.push(`Nenhuma linha do pedido ${pedido} estava aguardando tecido.`);
    for (const l of linhas) {
      await atualizar("PEDIDOS", l.id, { STATUS: "na_fila" });
      pedidosLiberados.push(l.id);
    }
  }

  const saldo = r3(item.saldo + sinal(tipoMov, quantidade));
  if (item.minimo > 0 && saldo < item.minimo && tipoMov !== "entrada") {
    avisos.push(`${item.nome} abaixo do minimo: ${saldo} de ${item.minimo} ${item.unidade}.`);
  }
  return { id, saldo, avisos, gastoId, pedidosLiberados };
}

/** Consumo de tinta (L/kg) por maquina num mes: base do custo por metro. */
export async function consumoTintaNoMes(mes: string): Promise<{ total: number; porMaquina: Record<string, number> }> {
  const [itens, movs] = await Promise.all([lerTabela("ITENS_ESTOQUE"), lerTabela("MOV_ESTOQUE")]);
  const tintas = new Set(itens.filter((i) => i.TIPO === "tinta").map((i) => String(i.ID)));
  const porMaquina: Record<string, number> = {};
  let total = 0;
  for (const m of movs) {
    if (m.TIPO_MOV !== "saida" || !tintas.has(String(m.ITEM_ID)) || !noMes(m.DATA_HORA, mes)) continue;
    const q = Number(m.QUANTIDADE);
    total += q;
    const k = String(m.MAQUINA) || "sem_maquina";
    porMaquina[k] = (porMaquina[k] ?? 0) + q;
  }
  return { total: r3(total), porMaquina };
}

/** Itens iniciais (so se o cadastro estiver vazio): CMYK de pigmento + tecido do cliente. */
export const ITENS_INICIAIS: NovoItem[] = [
  { tipo: "tinta", nome: "Pigmento Ciano", cor: "ciano", unidade: "L", minimo: 5 },
  { tipo: "tinta", nome: "Pigmento Magenta", cor: "magenta", unidade: "L", minimo: 5 },
  { tipo: "tinta", nome: "Pigmento Amarelo", cor: "amarelo", unidade: "L", minimo: 5 },
  { tipo: "tinta", nome: "Pigmento Preto", cor: "preto", unidade: "L", minimo: 5 },
  { tipo: "tecido_cliente", nome: "Tecido do cliente", unidade: "m", obs: "Tecido enviado pelo cliente para estampar" },
];
