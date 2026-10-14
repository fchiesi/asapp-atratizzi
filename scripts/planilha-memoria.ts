/**
 * Planilha Google em memoria para testes (imita values.get/update/batchUpdate
 * com UNFORMATTED_VALUE e USER_ENTERED como o Sheets de verdade):
 *  - "DD/MM/AAAA" e "DD/MM/AAAA HH:MM" viram serial de data
 *  - texto numerico vira numero; "'0123" vira o texto "0123"
 *  - leitura corta linhas/celulas vazias do fim, como a API
 */
import type { sheets_v4 } from "googleapis";

type Celula = string | number;

function colIdx(letras: string): number {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRange(range: string) {
  const [tabRaw, ref] = range.split("!");
  const tab = tabRaw.replace(/^'|'$/g, "");
  const [a, b] = ref.split(":");
  const pa = a.match(/^([A-Z]+)(\d+)?$/)!;
  const pb = b?.match(/^([A-Z]+)(\d+)?$/);
  return {
    tab,
    c0: colIdx(pa[1]),
    r0: Number(pa[2] ?? 1) - 1,
    c1: pb ? colIdx(pb[1]) : colIdx(pa[1]),
    r1: pb ? (pb[2] ? Number(pb[2]) - 1 : 99999) : Number(pa[2] ?? 1) - 1,
  };
}

function serial(d: number, m: number, y: number, h = 0, min = 0): number {
  return (Date.UTC(y, m - 1, d, h, min) - Date.UTC(1899, 11, 30)) / 86400000;
}

function converter(v: unknown, modo: string): Celula {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const s = String(v);
  if (modo === "RAW") return s;
  if (s.startsWith("'")) return s.slice(1);
  // o Sheets avaliaria a formula; aqui so marca, pra o teste perceber
  if (/^[=+@]/.test(s) || /^-[^\d]/.test(s)) return `#FORMULA ${s}`;
  const dt = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/);
  if (dt) return serial(+dt[1], +dt[2], +dt[3], +(dt[4] ?? 0), +(dt[5] ?? 0));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

export function criarPlanilhaMemoria() {
  const abas = new Map<string, Celula[][]>();
  const aba = (t: string) => {
    if (!abas.has(t)) abas.set(t, []);
    return abas.get(t)!;
  };

  function ler(range: string): Celula[][] {
    const { tab, c0, r0, c1, r1 } = parseRange(range);
    const grid = aba(tab);
    const out: Celula[][] = [];
    for (let r = r0; r <= Math.min(r1, grid.length - 1); r++) {
      const linha = (grid[r] ?? []).slice(c0, c1 + 1);
      while (linha.length && (linha[linha.length - 1] === "" || linha[linha.length - 1] === undefined)) linha.pop();
      out.push(linha.map((c) => c ?? ""));
    }
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }

  function escrever(range: string, values: unknown[][], modo: string) {
    const { tab, c0, r0 } = parseRange(range);
    const grid = aba(tab);
    values.forEach((row, i) => {
      const r = r0 + i;
      while (grid.length <= r) grid.push([]);
      row.forEach((v, j) => {
        const linha = grid[r];
        while (linha.length <= c0 + j) linha.push("");
        linha[c0 + j] = converter(v, modo);
      });
    });
  }

  const fake = {
    spreadsheets: {
      values: {
        get: async (p: { range: string }) => ({ data: { values: ler(p.range) } }),
        batchGet: async (p: { ranges: string[] }) => ({
          data: { valueRanges: p.ranges.map((r) => ({ range: r, values: ler(r) })) },
        }),
        update: async (p: { range: string; valueInputOption: string; requestBody: { values: unknown[][] } }) => {
          escrever(p.range, p.requestBody.values, p.valueInputOption);
          return { data: {} };
        },
        batchUpdate: async (p: {
          requestBody: { valueInputOption: string; data: { range: string; values: unknown[][] }[] };
        }) => {
          for (const d of p.requestBody.data) escrever(d.range, d.values, p.requestBody.valueInputOption);
          return { data: {} };
        },
      },
    },
  };

  return { cliente: fake as unknown as sheets_v4.Sheets, abas };
}
