import {
  batchUpdate,
  generateId,
  getNextEmptyRow,
  parseDateBR,
  readRange,
  readRangeCached,
  TTL_CURTO_MS,
  writeRange,
} from "@/lib/sheets";
import { comTrava } from "@/lib/sheets-lock";

/**
 * Esquema da planilha ASApp_Atratizzi (uma planilha so, uma aba por tabela).
 *
 * No SApp eram 9 planilhas herdadas do AppSheet, cada uma com seu layout.
 * Aqui comecamos limpo: linha 1 = cabecalho, dados a partir da linha 2,
 * coluna A = ID. O codigo le e grava por NOME de coluna, nunca por letra.
 *
 * ATENCAO: a planilha "Controle Atratizzi" (pasta ASapp no Drive) le PEDIDOS,
 * GASTOS e RECEBIMENTOS por IMPORTRANGE/QUERY pela LETRA da coluna. Coluna nova
 * vai sempre no FIM da aba; nunca insira no meio nem reordene.
 *
 * Para mudar uma aba: edite TABELAS e rode `npx tsx scripts/setup-planilha.ts`
 * (ele so acrescenta aba/cabecalho que falta, nunca apaga dado).
 *
 * Tipos de coluna (controlam a gravacao com USER_ENTERED):
 *  - texto: gravado com apostrofo quando parece numero/data (senao o Sheets
 *    come zero a esquerda de NF/telefone: "0123" vira 123) ou formula.
 *  - numero: gravado como numero.
 *  - data: "DD/MM/YYYY" -> vira data de verdade na planilha (serial na leitura).
 *  - datahora: "DD/MM/YYYY HH:MM".
 */

export type TipoColuna = "texto" | "numero" | "data" | "datahora";

interface Coluna {
  nome: string;
  tipo: TipoColuna;
}

const t = (nome: string): Coluna => ({ nome, tipo: "texto" });
const n = (nome: string): Coluna => ({ nome, tipo: "numero" });
const d = (nome: string): Coluna => ({ nome, tipo: "data" });
const dh = (nome: string): Coluna => ({ nome, tipo: "datahora" });

export const TABELAS = {
  CLIENTES: [
    t("ID"), t("NOME"), t("DOCUMENTO"), t("CIDADE"), t("CONTATO"), t("TELEFONE"),
    t("EMAIL"), t("VENDEDOR"), t("CONDICAO"), d("CRIADO_EM"), t("OBS"),
  ],
  ORCAMENTOS: [
    t("ID"), d("DATA"), t("CLIENTE_ID"), t("CLIENTE"), t("SERVICO"), t("TECIDO"),
    n("ESTAMPAS"), n("METROS"), n("PRECO_M"), t("URGENTE"), n("VALOR"),
    n("AMOSTRA_VALOR"), d("AMOSTRA_DATA"), t("STATUS"), t("PEDIDO_ID"),
    t("VENDEDOR"), t("OBS"), t("CRIADO_POR"),
  ],
  PEDIDOS: [
    t("ID"), d("DATA"), t("CLIENTE_ID"), t("CLIENTE"), t("ORCAMENTO_ID"), t("SERVICO"),
    t("TECIDO"), n("ESTAMPAS"), n("METROS"), n("PRECO_M"), t("URGENTE"), n("VALOR"),
    n("DESCONTO_AMOSTRA"), n("VALOR_LIQUIDO"), d("PRAZO"), t("STATUS"), t("MAQUINA"),
    t("VENDEDOR"), t("NF"), d("DATA_ENTREGA"), t("OBS"), t("CRIADO_POR"),
    // modelo do SApp: 1 linha = pedido + desenho; PED_CLI agrupa as linhas
    // do mesmo pedido (e e' a chave do financeiro). DIAS_PGTO: "50/50",
    // "28", "30/60/90"... Colunas no fim pra nao deslocar as existentes.
    t("PED_CLI"), t("DESENHO"), t("DIAS_PGTO"),
  ],
  APONTAMENTOS: [
    t("ID"), dh("DATA_HORA"), t("PEDIDO_ID"), t("MAQUINA"), t("ETAPA"), n("METROS"),
    n("PERDA_M"), t("OPERADOR"), t("OBS"),
  ],
  PARADAS: [
    t("ID"), d("DATA"), t("MAQUINA"), n("HORAS"), t("CAUSA"), t("DESCRICAO"), t("OPERADOR"),
  ],
  ROTINA: [
    t("ID"), dh("DATA_HORA"), t("MAQUINA"), t("TIPO"), t("OPERADOR"), t("OBS"),
  ],
  GASTOS: [
    t("ID"), d("DATA_ENTRADA"), d("DATA_VENC"), t("CATEGORIA"), t("CREDOR"), t("DESCRICAO"),
    t("NF"), n("VALOR"), t("STATUS"), d("DATA_PGTO"), t("BANCO"), t("OBS"), t("ORIGEM"),
  ],
  RECEBIMENTOS: [
    t("ID"), d("DATA_EMISSAO"), d("DATA_VENC"), t("CLIENTE"), t("PEDIDO_ID"),
    t("ORCAMENTO_ID"), t("TIPO"), t("NF"), n("VALOR"), t("STATUS"), d("DATA_RECEB"),
    t("BANCO"), t("OBS"), t("ORIGEM"),
  ],
  ITENS_ESTOQUE: [
    t("ID"), t("TIPO"), t("NOME"), t("COR"), t("UNIDADE"), n("LARGURA_M"), t("FORNECEDOR"),
    n("ESTOQUE_MINIMO"), n("CUSTO_UNIT"), t("ATIVO"), t("OBS"),
  ],
  MOV_ESTOQUE: [
    t("ID"), dh("DATA_HORA"), t("ITEM_ID"), t("ITEM"), t("TIPO_MOV"), n("QUANTIDADE"), n("CUSTO_UNIT"),
    n("VALOR"), t("FORNECEDOR"), t("NF"), t("PEDIDO"), t("MAQUINA"), t("LOTE"), t("OPERADOR"), t("OBS"),
  ],
  METAS: [
    t("MES"), n("METROS_META"), n("PRECO_MEDIO_META"), n("CUSTO_FIXO"), t("OBS"),
  ],
} as const satisfies Record<string, readonly Coluna[]>;

export type Tabela = keyof typeof TABELAS;

type NomesColunas<T extends Tabela> = (typeof TABELAS)[T][number]["nome"];

/** Uma linha lida da planilha. Datas voltam como "DD/MM/YYYY" (datahora com hora). */
export type Registro<T extends Tabela> = Record<NomesColunas<T>, string | number> & {
  /** linha na planilha (1-indexed) */
  _linha: number;
};

export type Novo<T extends Tabela> = Partial<Record<NomesColunas<T>, string | number | null>>;

export function colunas(tab: Tabela): readonly Coluna[] {
  return TABELAS[tab];
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function letraColuna(i: number): string {
  let s = "";
  let x = i + 1;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function ultimaLetra(tab: Tabela): string {
  return letraColuna(TABELAS[tab].length - 1);
}

const pad2 = (x: number) => String(x).padStart(2, "0");

/** Serial do Sheets (com fracao de dia) -> "DD/MM/YYYY" ou "DD/MM/YYYY HH:MM". */
function serialParaTexto(v: number, comHora: boolean): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(v * 86400000);
  const dt = new Date(ms);
  const data = `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
  if (!comHora) return data;
  return `${data} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
}

function lerCelula(v: unknown, tipo: TipoColuna): string | number {
  if (v === null || v === undefined || v === "") return tipo === "numero" ? 0 : "";
  switch (tipo) {
    case "numero": {
      if (typeof v === "number") return v;
      const x = Number(String(v).replace(/\./g, "").replace(",", "."));
      return Number.isFinite(x) ? x : 0;
    }
    case "data":
    case "datahora":
      if (typeof v === "number") return serialParaTexto(v, tipo === "datahora");
      return String(v).trim();
    default:
      return String(v).trim();
  }
}

function gravarCelula(v: unknown, tipo: TipoColuna): string | number {
  if (v === null || v === undefined) return "";
  if (tipo === "numero") {
    if (v === "") return "";
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : "";
  }
  const s = String(v).trim();
  // texto que o Sheets reinterpretaria: numero/data (perde zero a esquerda) ou
  // formula (=, +, -, @ no inicio - digitado pelo usuario, nunca executar)
  if (tipo === "texto" && s !== "" && (/^[\d+\-=.,/: ]+$/.test(s) || /^[=+\-@]/.test(s))) return `'${s}`;
  return s;
}

function montarRegistro<T extends Tabela>(tab: T, row: unknown[], linha: number): Registro<T> {
  const out: Record<string, string | number> = {};
  TABELAS[tab].forEach((c, i) => {
    out[c.nome] = lerCelula(row[i], c.tipo);
  });
  return { ...(out as Record<NomesColunas<T>, string | number>), _linha: linha };
}

/**
 * Le a aba inteira. `fresco: true` pula o cache (use dentro da trava, antes
 * de decidir numero/linha).
 */
export async function lerTabela<T extends Tabela>(
  tab: T,
  opts: { fresco?: boolean } = {},
): Promise<Registro<T>[]> {
  const range = `${tab}!A2:${ultimaLetra(tab)}20000`;
  const rows = opts.fresco
    ? await readRange(range)
    : await readRangeCached(range, undefined, TTL_CURTO_MS);
  const out: Registro<T>[] = [];
  rows.forEach((row, i) => {
    if (String(row?.[0] ?? "").trim() === "") return;
    out.push(montarRegistro(tab, row, i + 2));
  });
  return out;
}

function linhaParaGravar<T extends Tabela>(tab: T, obj: Novo<T>): (string | number)[] {
  return TABELAS[tab].map((c) => gravarCelula((obj as Record<string, unknown>)[c.nome], c.tipo));
}

/** Prefixos de ID sequencial. Abas fora daqui usam ID aleatorio de 8 chars. */
const PREFIXO_SEQUENCIAL: Partial<Record<Tabela, string>> = {
  CLIENTES: "C",
  ORCAMENTOS: "O",
  PEDIDOS: "P",
  ITENS_ESTOQUE: "E",
};

function proximoSequencial(prefixo: string, existentes: string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefixo}-(\\d+)$`);
  for (const id of existentes) {
    const m = id.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefixo}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Insere uma linha no fim da aba, com a planilha travada (duas pessoas
 * gravando ao mesmo tempo nao pegam a mesma linha nem o mesmo numero).
 * Devolve o registro com o ID gerado.
 */
export async function inserir<T extends Tabela>(
  tab: T,
  obj: Novo<T>,
  quem: string,
): Promise<{ id: string; linha: number }> {
  return comTrava(`asapp:${quem}`, async () => {
    const dados = { ...obj } as Record<string, unknown>;
    if (!dados.ID) {
      const prefixo = PREFIXO_SEQUENCIAL[tab];
      if (prefixo) {
        const ids = (await readRange(`${tab}!A2:A20000`)).map((r) => String(r?.[0] ?? ""));
        dados.ID = proximoSequencial(prefixo, ids);
      } else {
        dados.ID = generateId();
      }
    }
    const linha = await getNextEmptyRow(tab, 1);
    await writeRange(
      `${tab}!A${linha}:${ultimaLetra(tab)}${linha}`,
      [linhaParaGravar(tab, dados as Novo<T>)],
    );
    return { id: String(dados.ID), linha };
  });
}

/**
 * Atualiza colunas de uma linha achada pelo ID (coluna A). So grava as
 * colunas presentes em `patch`. Devolve false se o ID nao existe.
 */
export async function atualizar<T extends Tabela>(
  tab: T,
  id: string,
  patch: Novo<T>,
): Promise<boolean> {
  const ids = await readRange(`${tab}!A2:A20000`);
  const idx = ids.findIndex((r) => String(r?.[0] ?? "").trim() === id.trim());
  if (idx < 0) return false;
  const linha = idx + 2;
  const cols = TABELAS[tab];
  const data: { range: string; values: unknown[][] }[] = [];
  for (const [nome, valor] of Object.entries(patch)) {
    const i = cols.findIndex((c) => c.nome === nome);
    if (i < 0) throw new Error(`Coluna ${nome} nao existe em ${tab}`);
    data.push({
      range: `${tab}!${letraColuna(i)}${linha}`,
      values: [[gravarCelula(valor, cols[i].tipo)]],
    });
  }
  await batchUpdate(data);
  return true;
}

// ── Datas no fuso de Blumenau ──────────────────────────────────────────────
// A Vercel roda em UTC: depois das 21h o "hoje" do servidor ja e amanha.

const FUSO = "America/Sao_Paulo";

function partesAgora(): { d: number; m: number; y: number; h: number; min: number } {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { d: get("day"), m: get("month"), y: get("year"), h: get("hour") % 24, min: get("minute") };
}

/** Hoje em DD/MM/YYYY, no fuso de Blumenau. */
export function hojeBR(): string {
  const a = partesAgora();
  return `${pad2(a.d)}/${pad2(a.m)}/${a.y}`;
}

/** Agora em "DD/MM/YYYY HH:MM", no fuso de Blumenau. */
export function agoraBR(): string {
  const a = partesAgora();
  return `${hojeBR()} ${pad2(a.h)}:${pad2(a.min)}`;
}

/** Mes atual "AAAA-MM", no fuso de Blumenau. */
export function mesAtual(): string {
  const a = partesAgora();
  return `${a.y}-${pad2(a.m)}`;
}

/** Data (DD/MM/YYYY ou serial) -> AAAAMMDD comparavel. 0 se invalida. */
export function ordinal(v: unknown): number {
  const dt = parseDateBR(v);
  return dt ? dt.y * 10000 + dt.m * 100 + dt.d : 0;
}

/** "DD/MM/YYYY" + n dias -> "DD/MM/YYYY". */
export function somarDias(dataBR: string, dias: number): string {
  const dt = parseDateBR(dataBR);
  if (!dt) return dataBR;
  const x = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + dias));
  return `${pad2(x.getUTCDate())}/${pad2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
}

/** True se a data cai no mes "AAAA-MM". */
export function noMes(v: unknown, mes: string): boolean {
  const dt = parseDateBR(v);
  if (!dt) return false;
  return `${dt.y}-${pad2(dt.m)}` === mes;
}
