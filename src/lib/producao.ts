import { agoraBR, atualizar, hojeBR, inserir, lerTabela, ordinal } from "@/lib/planilha";
import {
  CAUSAS_PARADA,
  ehFlush,
  ETAPAS,
  MAQUINAS,
  TIPOS_ROTINA,
  type Maquina,
} from "@/lib/config";
import { listarPedidos, type Pedido } from "@/lib/comercial";
import { exigir, numeroPositivo, texto } from "@/lib/erros";
import { isValidDateBR } from "@/lib/sheets";

/**
 * Producao (Proposta v6, paginas 2, 5 e 7):
 * - apontamento de metros por pedido, maquina e etapa (com perda)
 * - registro de TODA parada da Reggiani 1 desde o primeiro dia (mostra
 *   quanto a Reggiani 2 esta cobrindo)
 * - flush (troca de tinta ou entupimento - nao e diario) e rodada semanal
 *   da R2 (roda pelo menos 1x por semana para nao secar as cabecas)
 */

function maquinaValida(m: unknown): Maquina {
  const s = texto(m).toUpperCase();
  exigir((MAQUINAS as readonly string[]).includes(s), `Maquina invalida: ${m}. Use R1 ou R2.`);
  return s as Maquina;
}

export interface NovoApontamento {
  pedidoId: string;
  maquina: string;
  etapa: string;
  metros: number;
  perda?: number;
  obs?: string;
}

/**
 * Aponta metros. Primeira impressao de um pedido "aguardando_tecido" ou
 * "na_fila" passa ele pra "em_producao" e grava a maquina.
 */
export async function apontar(a: NovoApontamento, quem: string): Promise<{ id: string; avisos: string[] }> {
  const pedidos = await listarPedidos();
  const pedido = pedidos.find((p) => p.id === texto(a.pedidoId));
  exigir(pedido, `Pedido ${a.pedidoId} nao encontrado.`);
  exigir(pedido.status !== "entregue" && pedido.status !== "cancelado", `Pedido ${pedido.id} esta ${pedido.status}.`);
  const etapa = texto(a.etapa);
  exigir((ETAPAS as readonly string[]).includes(etapa), `Etapa invalida: ${a.etapa}.`);
  const maquina = maquinaValida(a.maquina);
  const metros = numeroPositivo(a.metros, "Metros");
  const perda = Math.max(0, Number(a.perda ?? 0) || 0);

  const avisos: string[] = [];
  if (etapa === "impressao" && pedido.metrosImpressos + metros > pedido.metros * 1.1) {
    avisos.push(
      `Impresso passa de 110% do pedido (${pedido.metrosImpressos + metros} m de ${pedido.metros} m). Confira.`,
    );
  }

  const { id } = await inserir(
    "APONTAMENTOS",
    {
      DATA_HORA: agoraBR(),
      PEDIDO_ID: pedido.id,
      MAQUINA: maquina,
      ETAPA: etapa,
      METROS: metros,
      PERDA_M: perda,
      OPERADOR: quem,
      OBS: texto(a.obs),
    },
    quem,
  );

  if (etapa === "impressao" && (pedido.status === "aguardando_tecido" || pedido.status === "na_fila")) {
    await atualizar("PEDIDOS", pedido.id, { STATUS: "em_producao", MAQUINA: maquina });
  }
  return { id, avisos };
}

export interface NovaParada {
  maquina: string;
  horas: number;
  causa: string;
  descricao?: string;
  data?: string;
}

export async function registrarParada(p: NovaParada, quem: string): Promise<{ id: string }> {
  const maquina = maquinaValida(p.maquina);
  const horas = numeroPositivo(p.horas, "Horas paradas");
  exigir(horas <= 24, "Uma parada por dia: no maximo 24 h. Para varios dias, registre um por dia.");
  const causa = texto(p.causa);
  exigir((CAUSAS_PARADA as readonly string[]).includes(causa), `Causa invalida: ${p.causa}.`);
  const data = p.data && isValidDateBR(p.data) ? p.data : hojeBR();
  return inserir(
    "PARADAS",
    { DATA: data, MAQUINA: maquina, HORAS: horas, CAUSA: causa, DESCRICAO: texto(p.descricao), OPERADOR: quem },
    quem,
  );
}

export async function registrarRotina(
  r: { maquina: string; tipo: string; obs?: string },
  quem: string,
): Promise<{ id: string }> {
  const maquina = maquinaValida(r.maquina);
  const tipo = texto(r.tipo);
  exigir((TIPOS_ROTINA as readonly string[]).includes(tipo), `Tipo invalido: ${r.tipo}.`);
  return inserir("ROTINA", { DATA_HORA: agoraBR(), MAQUINA: maquina, TIPO: tipo, OPERADOR: quem, OBS: texto(r.obs) }, quem);
}

export interface ResumoMaquina {
  maquina: Maquina;
  metrosHoje: number;
  /** ultimo flush registrado (qualquer motivo); null = nenhum */
  ultimoFlush: { dataHora: string; tipo: string; dias: number } | null;
  horasParadasHoje: number;
  /** dias desde a ultima rodada (impressao ou rodada_semanal); null = nunca */
  diasSemRodar: number | null;
}

export interface PainelProducao {
  hoje: string;
  maquinas: ResumoMaquina[];
  fila: Pedido[];
  ultimosApontamentos: {
    dataHora: string;
    pedidoId: string;
    maquina: string;
    etapa: string;
    metros: number;
    perda: number;
    operador: string;
  }[];
}

function diasEntre(a: number, b: number): number {
  const toDate = (o: number) => Date.UTC(Math.floor(o / 10000), Math.floor((o % 10000) / 100) - 1, o % 100);
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

export async function painelProducao(): Promise<PainelProducao> {
  const [fila, aptos, paradas, rotina] = await Promise.all([
    listarPedidos({ abertos: true }),
    lerTabela("APONTAMENTOS"),
    lerTabela("PARADAS"),
    lerTabela("ROTINA"),
  ]);
  const hoje = hojeBR();
  const ordHoje = ordinal(hoje);

  const maquinas: ResumoMaquina[] = MAQUINAS.map((m) => {
    const aptosM = aptos.filter((a) => a.MAQUINA === m);
    const metrosHoje = aptosM
      .filter((a) => a.ETAPA === "impressao" && ordinal(a.DATA_HORA) === ordHoje)
      .reduce((s, a) => s + Number(a.METROS), 0);
    // a aba e' so acrescentada: o ultimo flush da maquina e' a ultima linha
    const flush = rotina.filter((r) => r.MAQUINA === m && ehFlush(r.TIPO)).at(-1);
    const horasParadasHoje = paradas
      .filter((p) => p.MAQUINA === m && ordinal(p.DATA) === ordHoje)
      .reduce((s, p) => s + Number(p.HORAS), 0);
    const rodadas = [
      ...aptosM.filter((a) => a.ETAPA === "impressao").map((a) => ordinal(a.DATA_HORA)),
      ...rotina.filter((r) => r.MAQUINA === m && r.TIPO === "rodada_semanal").map((r) => ordinal(r.DATA_HORA)),
    ].filter(Boolean);
    const ultima = rodadas.length ? Math.max(...rodadas) : 0;
    return {
      maquina: m,
      metrosHoje,
      ultimoFlush: flush
        ? { dataHora: String(flush.DATA_HORA), tipo: String(flush.TIPO), dias: diasEntre(ordinal(flush.DATA_HORA), ordHoje) }
        : null,
      horasParadasHoje,
      diasSemRodar: ultima ? diasEntre(ultima, ordHoje) : null,
    };
  });

  // fila: urgente primeiro, depois prazo mais proximo
  fila.sort(
    (a, b) =>
      Number(b.urgente) - Number(a.urgente) ||
      (ordinal(a.prazo) || 99999999) - (ordinal(b.prazo) || 99999999),
  );

  const ultimosApontamentos = aptos
    .slice(-15)
    .reverse()
    .map((a) => ({
      dataHora: String(a.DATA_HORA),
      pedidoId: String(a.PEDIDO_ID),
      maquina: String(a.MAQUINA),
      etapa: String(a.ETAPA),
      metros: Number(a.METROS),
      perda: Number(a.PERDA_M),
      operador: String(a.OPERADOR),
    }));

  return { hoje, maquinas, fila, ultimosApontamentos };
}
