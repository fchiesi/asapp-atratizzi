/**
 * Prepara a planilha ASApp_Atratizzi (idempotente - pode rodar de novo):
 *  - locale pt_BR e fuso America/Sao_Paulo (datas DD/MM/AAAA viram data)
 *  - cria as abas que faltam (TABELAS em src/lib/planilha.ts) + _LOCK oculta
 *  - escreve o cabecalho na linha 1 SO se ela estiver vazia; congela e negrita
 *  - coluna nova no FIM de uma aba ja existente: acrescenta o cabecalho
 *  - semeia METAS com os 12 meses do plano, se a aba estiver vazia
 *  - semeia ITENS_ESTOQUE (CMYK de pigmento + tecido do cliente), se vazia
 * Nunca apaga aba nem dado.
 *
 * Antes: crie uma planilha vazia no Drive, compartilhe com o e-mail da
 * Service Account como Editor e ponha o ID em SHEETS_ASAPP_ID no .env.local.
 *
 * Rodar: npx tsx scripts/setup-planilha.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { getSheetsClient, getDefaultSpreadsheetId, readRange, writeRange } = await import("../src/lib/sheets");
  const { TABELAS, letraColuna } = await import("../src/lib/planilha");
  const { METAS_PADRAO } = await import("../src/lib/config");
  const { INICIO_OPERACAO } = await import("../src/lib/metas");

  const spreadsheetId = getDefaultSpreadsheetId();
  if (!spreadsheetId) throw new Error("SHEETS_ASAPP_ID nao configurado no .env.local");
  const sheets = getSheetsClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "properties,sheets.properties" });
  console.log(`Planilha: ${meta.data.properties?.title} (${spreadsheetId})`);
  const existentes = new Map((meta.data.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]));

  const nomes = [...Object.keys(TABELAS), "_LOCK"];
  const faltam = nomes.filter((n) => !existentes.has(n));

  const requests: object[] = [
    {
      updateSpreadsheetProperties: {
        properties: { locale: "pt_BR", timeZone: "America/Sao_Paulo" },
        fields: "locale,timeZone",
      },
    },
    ...faltam.map((title) => ({
      addSheet: {
        properties: {
          title,
          hidden: title === "_LOCK",
          gridProperties: title === "_LOCK" ? { rowCount: 5, columnCount: 2 } : { rowCount: 1000, frozenRowCount: 1 },
        },
      },
    })),
  ];
  const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  for (const r of res.data.replies ?? []) {
    const p = r.addSheet?.properties;
    if (p?.title) existentes.set(p.title, p.sheetId!);
  }
  console.log(faltam.length ? `Abas criadas: ${faltam.join(", ")}` : "Todas as abas ja existiam.");

  // A "Pagina1"/"Sheet1" que nasce com a planilha fica la: apague a mao se quiser.

  const formatos: object[] = [];
  for (const [tab, cols] of Object.entries(TABELAS)) {
    const ultima = letraColuna(cols.length - 1);
    const cab = await readRange(`${tab}!A1:${ultima}1`, spreadsheetId);
    if ((cab[0] ?? []).every((c) => String(c ?? "").trim() === "")) {
      await writeRange(`${tab}!A1:${ultima}1`, [cols.map((c) => c.nome)], spreadsheetId, "RAW");
      console.log(`  ${tab}: cabecalho escrito (${cols.length} colunas)`);
    } else {
      const atual = (cab[0] ?? []).map((c) => String(c ?? "").trim()).filter((c, i, a) => c || a.slice(i).some(Boolean));
      const esperado = cols.map((c) => c.nome);
      const prefixoIgual = atual.every((n, i) => esperado[i] === n);
      if (prefixoIgual && atual.length < esperado.length) {
        // coluna nova no fim do esquema: acrescenta so o cabecalho que falta
        const ini = letraColuna(atual.length);
        await writeRange(`${tab}!${ini}1:${ultima}1`, [esperado.slice(atual.length)], spreadsheetId, "RAW");
        console.log(`  ${tab}: colunas novas no fim: ${esperado.slice(atual.length).join(", ")}`);
      } else {
        const diferente = esperado.filter((n, i) => atual[i] !== n);
        console.log(diferente.length ? `  ${tab}: ATENCAO cabecalho difere em ${diferente.join(", ")}` : `  ${tab}: ok`);
      }
    }
    const sheetId = existentes.get(tab)!;
    formatos.push(
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.88, green: 0.95, blue: 0.94 } } },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      },
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    );
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: formatos } });

  const metas = await readRange("METAS!A2:A100", spreadsheetId);
  if (metas.length === 0) {
    const [y, m] = INICIO_OPERACAO.split("-").map(Number);
    const linhas = METAS_PADRAO.metrosPorMesDaOperacao.map((metros, i) => {
      const d = new Date(Date.UTC(y, m - 1 + i, 1));
      const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const custo = i + 1 >= 7 ? METAS_PADRAO.custoFixoFase2 : METAS_PADRAO.custoFixoFase1;
      return [mes, metros, METAS_PADRAO.precoMedio, custo, `mes ${i + 1} do plano (Proposta v6)`];
    });
    // RAW: "2026-11" tem que ficar texto, nao virar data
    await writeRange(`METAS!A2:E${linhas.length + 1}`, linhas, spreadsheetId, "RAW");
    console.log(`  METAS: ${linhas.length} meses semeados a partir de ${INICIO_OPERACAO}`);
  }

  const itens = await readRange("ITENS_ESTOQUE!A2:A100", spreadsheetId);
  if (itens.length === 0) {
    const { criarItem, ITENS_INICIAIS } = await import("../src/lib/estoque");
    for (const it of ITENS_INICIAIS) await criarItem(it, "setup");
    console.log(`  ITENS_ESTOQUE: ${ITENS_INICIAIS.length} itens iniciais (${ITENS_INICIAIS.map((i) => i.nome).join(", ")})`);
  }

  console.log("\nPronto.");
}

main().catch((e) => {
  console.error("Falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
