import {
  atualizar,
  hojeBR,
  inserir,
  lerTabela,
  ordinal,
  somarDias,
  type Registro,
} from "@/lib/planilha";
import {
  avisosMinimo,
  CONDICOES,
  precoSugerido,
  servicoPorId,
  STATUS_PEDIDO,
  VALOR_AMOSTRA,
  type Condicao,
  type StatusPedido,
} from "@/lib/config";
import { ErroNegocio, exigir, numeroPositivo, texto } from "@/lib/erros";
import { isValidDateBR } from "@/lib/sheets";

/**
 * Fluxo comercial (Proposta v6, pagina 5):
 *   orcamento -> amostra cobrada (R$ 80) -> aprovacao -> pedido
 *   cliente novo: 50% na aprovacao + 50% na entrega
 *   cliente com 3 pedidos em dia: boleto 28 dias (condicao prazo28)
 *   o valor da amostra paga volta como desconto no pedido
 */

const r2 = (x: number) => Math.round(x * 100) / 100;

// ── Clientes ───────────────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  nome: string;
  documento: string;
  cidade: string;
  contato: string;
  telefone: string;
  email: string;
  vendedor: string;
  condicao: Condicao;
  obs: string;
}

function cliente(r: Registro<"CLIENTES">): Cliente {
  const cond = String(r.CONDICAO);
  return {
    id: String(r.ID),
    nome: String(r.NOME),
    documento: String(r.DOCUMENTO),
    cidade: String(r.CIDADE),
    contato: String(r.CONTATO),
    telefone: String(r.TELEFONE),
    email: String(r.EMAIL),
    vendedor: String(r.VENDEDOR),
    condicao: (CONDICOES as readonly string[]).includes(cond) ? (cond as Condicao) : "novo",
    obs: String(r.OBS),
  };
}

export async function listarClientes(busca?: string): Promise<Cliente[]> {
  const todos = (await lerTabela("CLIENTES")).map(cliente);
  const q = texto(busca).toLowerCase();
  const filtrados = q
    ? todos.filter((c) =>
        [c.nome, c.documento, c.cidade, c.contato].some((v) => v.toLowerCase().includes(q)),
      )
    : todos;
  return filtrados.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface NovoCliente {
  nome: string;
  documento?: string;
  cidade?: string;
  contato?: string;
  telefone?: string;
  email?: string;
  vendedor?: string;
  condicao?: string;
  obs?: string;
}

export async function criarCliente(c: NovoCliente, quem: string): Promise<{ id: string }> {
  const nome = texto(c.nome);
  exigir(nome, "Nome do cliente e obrigatorio.");
  const existentes = await lerTabela("CLIENTES", { fresco: true });
  const dup = existentes.find((x) => String(x.NOME).toLowerCase() === nome.toLowerCase());
  exigir(!dup, `Ja existe cliente com esse nome (${dup?.ID}).`);
  const condicao = (CONDICOES as readonly string[]).includes(texto(c.condicao)) ? texto(c.condicao) : "novo";
  const { id } = await inserir(
    "CLIENTES",
    {
      NOME: nome,
      DOCUMENTO: texto(c.documento),
      CIDADE: texto(c.cidade) || "Blumenau",
      CONTATO: texto(c.contato),
      TELEFONE: texto(c.telefone),
      EMAIL: texto(c.email),
      VENDEDOR: texto(c.vendedor) || quem,
      CONDICAO: condicao,
      CRIADO_EM: hojeBR(),
      OBS: texto(c.obs),
    },
    quem,
  );
  return { id };
}

async function acharCliente(id: string): Promise<Cliente> {
  const c = (await lerTabela("CLIENTES")).map(cliente).find((x) => x.id === id);
  if (!c) throw new ErroNegocio(`Cliente ${id} nao encontrado.`);
  return c;
}

// ── Orcamentos ─────────────────────────────────────────────────────────────

export interface Orcamento {
  id: string;
  data: string;
  clienteId: string;
  cliente: string;
  servico: string;
  tecido: string;
  estampas: number;
  metros: number;
  precoM: number;
  urgente: boolean;
  valor: number;
  amostraValor: number;
  amostraData: string;
  status: string;
  pedidoId: string;
  vendedor: string;
  obs: string;
}

function orcamento(r: Registro<"ORCAMENTOS">): Orcamento {
  return {
    id: String(r.ID),
    data: String(r.DATA),
    clienteId: String(r.CLIENTE_ID),
    cliente: String(r.CLIENTE),
    servico: String(r.SERVICO),
    tecido: String(r.TECIDO),
    estampas: Number(r.ESTAMPAS),
    metros: Number(r.METROS),
    precoM: Number(r.PRECO_M),
    urgente: String(r.URGENTE) === "S",
    valor: Number(r.VALOR),
    amostraValor: Number(r.AMOSTRA_VALOR),
    amostraData: String(r.AMOSTRA_DATA),
    status: String(r.STATUS),
    pedidoId: String(r.PEDIDO_ID),
    vendedor: String(r.VENDEDOR),
    obs: String(r.OBS),
  };
}

export async function listarOrcamentos(f: { status?: string; cliente?: string } = {}): Promise<Orcamento[]> {
  let lista = (await lerTabela("ORCAMENTOS")).map(orcamento);
  if (f.status) lista = lista.filter((o) => o.status === f.status);
  if (f.cliente) {
    const q = f.cliente.toLowerCase();
    lista = lista.filter((o) => o.cliente.toLowerCase().includes(q) || o.clienteId === f.cliente);
  }
  return lista.sort((a, b) => ordinal(b.data) - ordinal(a.data) || b.id.localeCompare(a.id));
}

export interface NovoOrcamento {
  clienteId: string;
  servico: string;
  tecido?: string;
  estampas?: number;
  metros: number;
  precoM?: number;
  urgente?: boolean;
  obs?: string;
}

export async function criarOrcamento(
  o: NovoOrcamento,
  quem: string,
): Promise<{ id: string; valor: number; avisos: string[] }> {
  const cli = await acharCliente(texto(o.clienteId));
  const serv = servicoPorId(texto(o.servico));
  exigir(serv, `Servico invalido: ${o.servico}.`);
  const metros = numeroPositivo(o.metros, "Metros");
  const estampas = Math.max(1, Math.floor(Number(o.estampas ?? 1)) || 1);
  const urgente = !!o.urgente;
  const precoM = o.precoM ? numeroPositivo(o.precoM, "Preco por metro") : precoSugerido(serv.id, urgente);
  const valor = r2(metros * precoM);
  const { id } = await inserir(
    "ORCAMENTOS",
    {
      DATA: hojeBR(),
      CLIENTE_ID: cli.id,
      CLIENTE: cli.nome,
      SERVICO: serv.id,
      TECIDO: texto(o.tecido),
      ESTAMPAS: estampas,
      METROS: metros,
      PRECO_M: precoM,
      URGENTE: urgente ? "S" : "N",
      VALOR: valor,
      AMOSTRA_VALOR: 0,
      STATUS: "aberto",
      VENDEDOR: cli.vendedor || quem,
      OBS: texto(o.obs),
      CRIADO_POR: quem,
    },
    quem,
  );
  return { id, valor, avisos: avisosMinimo(serv.id, metros, estampas) };
}

async function acharOrcamento(id: string): Promise<Orcamento> {
  const o = (await lerTabela("ORCAMENTOS", { fresco: true })).map(orcamento).find((x) => x.id === id);
  if (!o) throw new ErroNegocio(`Orcamento ${id} nao encontrado.`);
  return o;
}

/** Registra amostra cobrada: orcamento vira "amostra" e nasce a conta a receber. */
export async function enviarAmostra(
  id: string,
  quem: string,
  valor = VALOR_AMOSTRA,
): Promise<{ recebimentoId: string }> {
  const o = await acharOrcamento(id);
  exigir(o.status === "aberto", `Orcamento ${id} esta "${o.status}"; amostra so sai de orcamento aberto.`);
  const hoje = hojeBR();
  await atualizar("ORCAMENTOS", id, { STATUS: "amostra", AMOSTRA_VALOR: valor, AMOSTRA_DATA: hoje });
  const { id: recebimentoId } = await inserir(
    "RECEBIMENTOS",
    {
      DATA_EMISSAO: hoje,
      DATA_VENC: hoje,
      CLIENTE: o.cliente,
      ORCAMENTO_ID: id,
      TIPO: "amostra",
      VALOR: valor,
      STATUS: "aberto",
      OBS: "Amostra cobrada - desconta no pedido",
      ORIGEM: "app",
    },
    quem,
  );
  return { recebimentoId };
}

export async function marcarPerdido(id: string, motivo: string): Promise<void> {
  const o = await acharOrcamento(id);
  exigir(o.status !== "pedido", `Orcamento ${id} ja virou pedido ${o.pedidoId}.`);
  await atualizar("ORCAMENTOS", id, {
    STATUS: "perdido",
    OBS: [o.obs, texto(motivo) && `Perdido: ${texto(motivo)}`].filter(Boolean).join(" | "),
  });
}

/**
 * Aprova o orcamento e gera o pedido.
 * - desconto da amostra so se a amostra ja foi recebida
 * - cliente "novo": nasce entrada 50% (vence hoje) e saldo 50% (vence no prazo)
 * - cliente "prazo28": a conta nasce na entrega (28 dias)
 */
export async function aprovarOrcamento(
  id: string,
  quem: string,
  opts: { prazo?: string } = {},
): Promise<{ pedidoId: string; valorLiquido: number; avisos: string[] }> {
  const o = await acharOrcamento(id);
  exigir(o.status === "aberto" || o.status === "amostra", `Orcamento ${id} esta "${o.status}".`);
  const cli = await acharCliente(o.clienteId);
  const serv = servicoPorId(o.servico);
  const avisos: string[] = [];

  let desconto = 0;
  if (o.amostraValor > 0) {
    const receb = (await lerTabela("RECEBIMENTOS", { fresco: true })).find(
      (r) => r.ORCAMENTO_ID === id && r.TIPO === "amostra",
    );
    if (receb && receb.STATUS === "recebido") desconto = Number(receb.VALOR);
    else avisos.push("Amostra ainda nao recebida: pedido gerado sem o desconto da amostra.");
  }
  const valorLiquido = r2(Math.max(0, o.valor - desconto));

  const hoje = hojeBR();
  const prazoDias = o.urgente ? 3 : (serv?.prazoDias ?? 7);
  // dias uteis aproximados: +40% em dias corridos
  const prazo = opts.prazo && isValidDateBR(opts.prazo) ? opts.prazo : somarDias(hoje, Math.ceil(prazoDias * 1.4));

  const { id: pedidoId } = await inserir(
    "PEDIDOS",
    {
      DATA: hoje,
      CLIENTE_ID: cli.id,
      CLIENTE: cli.nome,
      ORCAMENTO_ID: o.id,
      SERVICO: o.servico,
      TECIDO: o.tecido,
      ESTAMPAS: o.estampas,
      METROS: o.metros,
      PRECO_M: o.precoM,
      URGENTE: o.urgente ? "S" : "N",
      VALOR: o.valor,
      DESCONTO_AMOSTRA: desconto,
      VALOR_LIQUIDO: valorLiquido,
      PRAZO: prazo,
      STATUS: "aguardando_tecido",
      VENDEDOR: o.vendedor,
      OBS: o.obs,
      CRIADO_POR: quem,
    },
    quem,
  );
  await atualizar("ORCAMENTOS", id, { STATUS: "pedido", PEDIDO_ID: pedidoId });

  if (cli.condicao === "novo" && valorLiquido > 0) {
    const metade = r2(valorLiquido / 2);
    const base = { CLIENTE: cli.nome, PEDIDO_ID: pedidoId, ORCAMENTO_ID: o.id, STATUS: "aberto", ORIGEM: "app" };
    await inserir("RECEBIMENTOS", { ...base, DATA_EMISSAO: hoje, DATA_VENC: hoje, TIPO: "entrada_50", VALOR: metade }, quem);
    await inserir(
      "RECEBIMENTOS",
      { ...base, DATA_EMISSAO: hoje, DATA_VENC: prazo, TIPO: "saldo_50", VALOR: r2(valorLiquido - metade) },
      quem,
    );
  }
  return { pedidoId, valorLiquido, avisos };
}

// ── Pedidos ────────────────────────────────────────────────────────────────

export interface Pedido {
  id: string;
  data: string;
  clienteId: string;
  cliente: string;
  orcamentoId: string;
  servico: string;
  tecido: string;
  estampas: number;
  metros: number;
  precoM: number;
  urgente: boolean;
  valor: number;
  descontoAmostra: number;
  valorLiquido: number;
  prazo: string;
  status: StatusPedido;
  maquina: string;
  vendedor: string;
  nf: string;
  dataEntrega: string;
  obs: string;
  /** soma dos metros apontados na etapa impressao */
  metrosImpressos: number;
  atrasado: boolean;
}

export async function listarPedidos(
  f: { status?: string; abertos?: boolean; cliente?: string } = {},
): Promise<Pedido[]> {
  const [rows, aptos] = await Promise.all([lerTabela("PEDIDOS"), lerTabela("APONTAMENTOS")]);
  const impressos = new Map<string, number>();
  for (const a of aptos) {
    if (a.ETAPA !== "impressao") continue;
    const k = String(a.PEDIDO_ID);
    impressos.set(k, (impressos.get(k) ?? 0) + Number(a.METROS));
  }
  const hoje = ordinal(hojeBR());
  let lista: Pedido[] = rows.map((r) => {
    const st = String(r.STATUS);
    const status = ((STATUS_PEDIDO as readonly string[]).includes(st) ? st : "na_fila") as StatusPedido;
    const fechado = status === "entregue" || status === "cancelado";
    return {
      id: String(r.ID),
      data: String(r.DATA),
      clienteId: String(r.CLIENTE_ID),
      cliente: String(r.CLIENTE),
      orcamentoId: String(r.ORCAMENTO_ID),
      servico: String(r.SERVICO),
      tecido: String(r.TECIDO),
      estampas: Number(r.ESTAMPAS),
      metros: Number(r.METROS),
      precoM: Number(r.PRECO_M),
      urgente: String(r.URGENTE) === "S",
      valor: Number(r.VALOR),
      descontoAmostra: Number(r.DESCONTO_AMOSTRA),
      valorLiquido: Number(r.VALOR_LIQUIDO),
      prazo: String(r.PRAZO),
      status,
      maquina: String(r.MAQUINA),
      vendedor: String(r.VENDEDOR),
      nf: String(r.NF),
      dataEntrega: String(r.DATA_ENTREGA),
      obs: String(r.OBS),
      metrosImpressos: impressos.get(String(r.ID)) ?? 0,
      atrasado: !fechado && ordinal(r.PRAZO) > 0 && ordinal(r.PRAZO) < hoje,
    };
  });
  if (f.status) lista = lista.filter((p) => p.status === f.status);
  if (f.abertos) lista = lista.filter((p) => p.status !== "entregue" && p.status !== "cancelado");
  if (f.cliente) {
    const q = f.cliente.toLowerCase();
    lista = lista.filter((p) => p.cliente.toLowerCase().includes(q) || p.clienteId === f.cliente);
  }
  return lista.sort((a, b) => ordinal(b.data) - ordinal(a.data) || b.id.localeCompare(a.id));
}

export interface AlteracaoPedido {
  status?: string;
  maquina?: string;
  nf?: string;
  prazo?: string;
  obs?: string;
}

/**
 * Muda status/maquina/NF/prazo. Ao marcar "entregue":
 * - grava DATA_ENTREGA = hoje
 * - cliente novo: saldo 50% passa a vencer hoje
 * - cliente prazo28: nasce o boleto de 28 dias
 */
export async function alterarPedido(id: string, alt: AlteracaoPedido, quem: string): Promise<void> {
  const pedido = (await listarPedidos()).find((p) => p.id === id);
  exigir(pedido, `Pedido ${id} nao encontrado.`);
  const patch: Record<string, string | number> = {};
  if (alt.status !== undefined) {
    exigir((STATUS_PEDIDO as readonly string[]).includes(alt.status), `Status invalido: ${alt.status}.`);
    exigir(pedido.status !== "entregue" || alt.status === "entregue", "Pedido entregue nao volta de status.");
    patch.STATUS = alt.status;
  }
  if (alt.maquina !== undefined) patch.MAQUINA = texto(alt.maquina);
  if (alt.nf !== undefined) patch.NF = texto(alt.nf);
  if (alt.obs !== undefined) patch.OBS = texto(alt.obs);
  if (alt.prazo !== undefined) {
    exigir(isValidDateBR(alt.prazo), "Prazo deve ser DD/MM/AAAA.");
    patch.PRAZO = alt.prazo;
  }
  const entregandoAgora = alt.status === "entregue" && pedido.status !== "entregue";
  const hoje = hojeBR();
  if (entregandoAgora) patch.DATA_ENTREGA = hoje;
  await atualizar("PEDIDOS", id, patch);

  if (entregandoAgora && pedido.valorLiquido > 0) {
    const cli = await acharCliente(pedido.clienteId);
    const recebs = await lerTabela("RECEBIMENTOS", { fresco: true });
    if (cli.condicao === "novo") {
      const saldo = recebs.find((r) => r.PEDIDO_ID === id && r.TIPO === "saldo_50" && r.STATUS === "aberto");
      if (saldo) await atualizar("RECEBIMENTOS", String(saldo.ID), { DATA_VENC: hoje });
    } else if (!recebs.some((r) => r.PEDIDO_ID === id && r.TIPO === "unico")) {
      await inserir(
        "RECEBIMENTOS",
        {
          DATA_EMISSAO: hoje,
          DATA_VENC: somarDias(hoje, 28),
          CLIENTE: pedido.cliente,
          PEDIDO_ID: id,
          ORCAMENTO_ID: pedido.orcamentoId,
          TIPO: "unico",
          NF: alt.nf ?? pedido.nf,
          VALOR: pedido.valorLiquido,
          STATUS: "aberto",
          ORIGEM: "app",
        },
        quem,
      );
    }
  }
}
