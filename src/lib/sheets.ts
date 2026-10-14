import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";

/**
 * Cliente Google Sheets autenticado via Service Account.
 *
 * IMPORTANTE: usar SEMPRE valueRenderOption "UNFORMATTED_VALUE" — e ele que
 * evita o bug de parser BR (5.000 virar 5 em vez de 5000).
 *
 * NAO usar dateTimeRenderOption "FORMATTED_STRING". Ele so afeta data, nao
 * numero, entao nunca fez parte daquela protecao — e trazia data como texto.
 * Texto lido e regravado com valueInputOption "USER_ENTERED" e REINTERPRETADO
 * pelo Sheets: a hora some (a linha nasce a meia-noite) e o dia/mes depende do
 * locale da planilha. (No SApp essa ida e volta gerou pedido duplicado.) Data agora vem como SERIAL; para consumir, use parseDateBR /
 * toDateBR, que aceitam serial e "DD/MM/YYYY".
 */

export const getDefaultSpreadsheetId = () => process.env.SHEETS_ASAPP_ID!;

let cachedClient: sheets_v4.Sheets | null = null;

/**
 * So para testes (scripts/test-fluxo.ts): troca o cliente do Google por uma
 * planilha em memoria. Nenhum codigo do app chama isto.
 */
export function usarClienteDeTeste(fake: sheets_v4.Sheets): void {
  cachedClient = fake;
  invalidarCache();
}

function getClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!email || !key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_KEY precisam estar configurados",
    );
  }

  // Sanitiza a chave aceitando varios formatos:
  // 1. Com aspas duplas no inicio/fim (que ficaram do .env.local)
  // 2. Com \n literais (texto)
  // 3. Com newlines reais (multiline no Vercel)
  key = key.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  // Converte \n literais pra newlines reais (idempotente)
  key = key.replace(/\\n/g, "\n");

  // Valida formato
  if (!key.includes("BEGIN PRIVATE KEY") || !key.includes("END PRIVATE KEY")) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY com formato invalido (faltando BEGIN/END PRIVATE KEY)",
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

/**
 * Cliente cru, para o que os helpers daqui nao cobrem: criar aba, apagar
 * linha, copiar formato, expandir a grade. Prefira os helpers — use este
 * so quando precisar da API de estrutura (spreadsheets.batchUpdate).
 */
export function getSheetsClient(): sheets_v4.Sheets {
  return getClient();
}

/** Le um range. Retorna lista de linhas (cada linha eh array). */
export async function readRange(
  range: string,
  spreadsheetId = getDefaultSpreadsheetId(),
): Promise<unknown[][]> {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (res.data.values ?? []) as unknown[][];
}

/** Le multiplos ranges de uma vez. */
export async function readRanges(
  ranges: string[],
  spreadsheetId = getDefaultSpreadsheetId(),
): Promise<Record<string, unknown[][]>> {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const out: Record<string, unknown[][]> = {};
  for (const vr of res.data.valueRanges ?? []) {
    if (vr.range) out[vr.range] = (vr.values ?? []) as unknown[][];
  }
  return out;
}

// ── Cache de leitura (por instancia, com TTL) ──────────────────────────────
//
// Painel, producao e pedidos reabrem a tela varias vezes por minuto. Cache
// em memoria do proprio processo, "single-flight": N chamadas iguais no mesmo
// intervalo compartilham UMA leitura. Toda escrita feita pelos helpers daqui
// invalida o cache da planilha escrita. Edicao manual direto na planilha so
// aparece quando o TTL vence (30-60s). Quem precisa do dado garantidamente
// fresco (validacao dentro da trava) usa readRange/readRanges direto.

interface EntradaCache {
  criadoEm: number;
  ttlMs: number;
  valor: Promise<unknown>;
}

const cacheLeitura = new Map<string, EntradaCache>();

export const TTL_CURTO_MS = 30_000;
export const TTL_MEDIO_MS = 60_000;

function chaveCache(spreadsheetId: string, alvo: string | string[]): string {
  return `${spreadsheetId}::${Array.isArray(alvo) ? alvo.join("|") : alvo}`;
}

async function lerComCache<T>(
  chave: string,
  ttlMs: number,
  carregar: () => Promise<T>,
): Promise<T> {
  const agora = Date.now();
  const atual = cacheLeitura.get(chave);
  if (atual && agora - atual.criadoEm < atual.ttlMs) {
    return atual.valor as Promise<T>;
  }
  const valor = carregar();
  cacheLeitura.set(chave, { criadoEm: agora, ttlMs, valor });
  // Leitura que falhou nao pode ficar cacheada como se fosse dado.
  valor.catch(() => {
    if (cacheLeitura.get(chave)?.valor === valor) cacheLeitura.delete(chave);
  });
  return valor;
}

/** readRange com cache por `ttlMs` (default 30s). Mesmo retorno do readRange. */
export async function readRangeCached(
  range: string,
  spreadsheetId = getDefaultSpreadsheetId(),
  ttlMs = TTL_CURTO_MS,
): Promise<unknown[][]> {
  return lerComCache(chaveCache(spreadsheetId, range), ttlMs, () =>
    readRange(range, spreadsheetId),
  );
}

/** readRanges com cache por `ttlMs` (default 30s). Mesmo retorno do readRanges. */
export async function readRangesCached(
  ranges: string[],
  spreadsheetId = getDefaultSpreadsheetId(),
  ttlMs = TTL_CURTO_MS,
): Promise<Record<string, unknown[][]>> {
  return lerComCache(chaveCache(spreadsheetId, ranges), ttlMs, () =>
    readRanges(ranges, spreadsheetId),
  );
}

/**
 * Derruba o cache de uma planilha (ou de todas, sem argumento). Os helpers
 * de escrita chamam sozinhos; chame a mao quando escrever via
 * getSheetsClient() direto (batchUpdate estrutural, deleteDimension...).
 */
export function invalidarCache(spreadsheetId?: string): void {
  if (!spreadsheetId) {
    cacheLeitura.clear();
    return;
  }
  const prefixo = `${spreadsheetId}::`;
  for (const k of cacheLeitura.keys()) {
    if (k.startsWith(prefixo)) cacheLeitura.delete(k);
  }
}

/**
 * Trava de seguranca dos testes: com ASAPP_BLOQUEAR_ESCRITA=1 no processo,
 * toda escrita pelos helpers abaixo falha ANTES de chegar ao Google.
 */
function bloquearEscritaEmTeste(onde: string): void {
  if (process.env.ASAPP_BLOQUEAR_ESCRITA === "1") {
    throw new Error(`escrita bloqueada (ASAPP_BLOQUEAR_ESCRITA=1): ${onde}`);
  }
}

/** Escreve em um range (substituindo valores). */
export async function writeRange(
  range: string,
  values: unknown[][],
  spreadsheetId = getDefaultSpreadsheetId(),
  valueInputOption: "USER_ENTERED" | "RAW" = "USER_ENTERED",
): Promise<void> {
  bloquearEscritaEmTeste(`writeRange ${range}`);
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption,
    requestBody: { values },
  });
  invalidarCache(spreadsheetId);
}

/** Append (adiciona linhas no final). */
export async function appendRows(
  range: string,
  values: unknown[][],
  spreadsheetId = getDefaultSpreadsheetId(),
): Promise<void> {
  bloquearEscritaEmTeste(`appendRows ${range}`);
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  invalidarCache(spreadsheetId);
}

/**
 * Adiciona linhas no final de forma DETERMINISTICA: detecta a ultima linha
 * com dado na col A e usa values.update no row seguinte. Evita o bug do
 * append com INSERT_ROWS quando ha formulas nas colunas (table-detection
 * desloca os valores).
 *
 * tab: nome da aba (ex: "GASTOS")
 * lastCol: ultima letra de coluna (ex: "Q" pra GASTOS, "O" pra RECEBIMENTOS)
 * headerRows: linhas de cabecalho antes dos dados (ex: 3)
 */
export async function appendRowsSafe(
  tab: string,
  lastCol: string,
  values: unknown[][],
  headerRows = 3,
  spreadsheetId = getDefaultSpreadsheetId(),
  // RAW quando a aba e' fila lida por robo: com USER_ENTERED o Sheets
  // reinterpreta "07/10/2026" como data (serial 46302) e quem le com
  // UNFORMATTED_VALUE recebe numero em vez do texto gravado.
  valueInputOption: "USER_ENTERED" | "RAW" = "USER_ENTERED",
): Promise<{ startRow: number; endRow: number }> {
  if (values.length === 0) return { startRow: 0, endRow: 0 };
  bloquearEscritaEmTeste(`appendRowsSafe ${tab}`);
  const sheets = getClient();

  // Le coluna A pra achar ultima linha com dado
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${headerRows + 1}:A30000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const aRows = colA.data.values ?? [];
  let lastDataRow = headerRows;
  for (let i = aRows.length - 1; i >= 0; i--) {
    const v = aRows[i]?.[0];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      lastDataRow = headerRows + 1 + i;
      break;
    }
  }
  const startRow = lastDataRow + 1;
  const endRow = startRow + values.length - 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A${startRow}:${lastCol}${endRow}`,
    valueInputOption,
    requestBody: { values },
  });
  invalidarCache(spreadsheetId);

  return { startRow, endRow };
}

/** batchUpdate em multiplos ranges. */
export async function batchUpdate(
  data: { range: string; values: unknown[][] }[],
  spreadsheetId = getDefaultSpreadsheetId(),
): Promise<void> {
  if (data.length === 0) return;
  bloquearEscritaEmTeste(`batchUpdate ${data.map((d) => d.range).join(", ")}`);
  const sheets = getClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: data.map((d) => ({ range: d.range, values: d.values })),
    },
  });
  invalidarCache(spreadsheetId);
}

/**
 * Encontra a linha (row number) de uma entrada pelo ID na primeira coluna.
 * tab: nome da aba, headerRows: linhas de cabecalho (ex: 3 -> dados em A4).
 * Retorna o numero da linha (1-indexed) ou null se nao encontrou.
 */
export async function findRowById(
  tab: string,
  id: string,
  headerRows = 3,
  spreadsheetId = getDefaultSpreadsheetId(),
): Promise<number | null> {
  const rows = await readRange(
    `${tab}!A${headerRows + 1}:A20000`,
    spreadsheetId,
  );
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i]?.[0] ?? "").trim() === id.trim()) {
      return headerRows + 1 + i;
    }
  }
  return null;
}

/**
 * Detecta a proxima linha vazia (apos dados) sem escrever nada.
 * Util quando a tool precisa montar formulas com o numero da linha antes de gravar.
 */
export async function getNextEmptyRow(
  tab: string,
  headerRows = 3,
  spreadsheetId = getDefaultSpreadsheetId(),
): Promise<number> {
  const sheets = getClient();
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${headerRows + 1}:A30000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const aRows = colA.data.values ?? [];
  let lastDataRow = headerRows;
  for (let i = aRows.length - 1; i >= 0; i--) {
    const v = aRows[i]?.[0];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      lastDataRow = headerRows + 1 + i;
      break;
    }
  }
  return lastDataRow + 1;
}

/** Gera ID alfanumerico de 8 chars (a-z + 0-9), padrao usado nos sheets. */
export function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** Data atual em DD/MM/YYYY (timezone local). */
export function todayBR(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export interface DateBR {
  d: number;
  m: number;
  y: number;
}

/**
 * Data vinda da planilha -> {d,m,y}. Aceita SERIAL (numero) e "DD/MM/YYYY".
 *
 * Existe porque a MESMA coluna volta como numero ou como texto dependendo do
 * dateTimeRenderOption da leitura. Um parser que so entende texto devolve null
 * no serial — e ai o filtro nao estoura, so PARA DE CASAR. Foi exatamente
 * assim que checagens de duplicidade emudeceram e deixaram passar linha
 * repetida. Todo consumo de data da planilha tem que passar por aqui.
 */
export function parseDateBR(v: unknown): DateBR | null {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 1) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    if (Number.isNaN(dt.getTime())) return null;
    return { d: dt.getUTCDate(), m: dt.getUTCMonth() + 1, y: dt.getUTCFullYear() };
  }

  // Sem "$" no fim de proposito: o parser antigo aceitava "15/10/2024 13:30"
  // (split por "/"), e ha coluna com data-hora em texto.
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  const y = Number(m[3]);
  if (!d || !mes || !y) return null;
  return { d, m: mes, y };
}

/** Data vinda da planilha -> "DD/MM/YYYY". "" se nao der pra interpretar. */
export function toDateBR(v: unknown): string {
  const dt = parseDateBR(v);
  if (!dt) return "";
  return `${String(dt.d).padStart(2, "0")}/${String(dt.m).padStart(2, "0")}/${dt.y}`;
}

/** Valida data no formato DD/MM/YYYY. */
export function isValidDateBR(s: string): boolean {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return false;
  const [d, m, y] = s.split("/").map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 2000 || y > 2100) return false;
  return true;
}
