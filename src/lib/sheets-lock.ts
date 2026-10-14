import { readRange, writeRange } from "@/lib/sheets";

/**
 * Trava de escrita da planilha ASApp (copiada do SApp).
 *
 * Duas gravacoes simultaneas calculando "ultima linha + 1" pegam a MESMA
 * linha e uma apaga a outra; dois orcamentos/pedidos novos tirariam o mesmo
 * numero. Toda escrita que acrescenta linha passa por aqui.
 *
 * COMO FUNCIONA: write-then-verify numa celula de aba oculta (`_LOCK`!A1) -
 * o Sheets nao tem compare-and-set. Escreve o proprio token, espera assentar,
 * rele: se o token que voltou e' o nosso, a trava e' nossa.
 *
 * Se a trava estiver inacessivel, nenhuma escrita e autorizada.
 */

const CEL_LOCK = "_LOCK!A1";
const ESPERA_PADRAO_MS = 30_000; // usuario esperando na tela
const TTL_MS = 900_000; // 15 min — dono que morreu sem liberar
const ASSENTAR_MS = 1_500;
const INTERVALO_MS = 2_000;

export class TravaOcupada extends Error {
  constructor(dono: string) {
    super(
      `A planilha esta sendo atualizada por outro processo (${dono}). ` +
        `Espere alguns segundos e tente de novo — nada foi gravado.`,
    );
    this.name = "TravaOcupada";
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 'token|quem|iso' -> partes. Formato invalido bloqueia a escrita. */
function partes(marca: string): { token: string; quem: string; quando: Date | null } {
  const p = marca.split("|");
  if (p.length !== 3) return { token: "", quem: "", quando: null };
  const d = new Date(p[2]);
  return { token: p[0], quem: p[1], quando: Number.isNaN(d.getTime()) ? null : d };
}

async function ler(): Promise<string> {
  const vals = await readRange(CEL_LOCK);
  return vals?.[0]?.[0] !== undefined ? String(vals[0][0]).trim() : "";
}

/**
 * Segura a trava e devolve o token. Falha de leitura impede a operacao.
 *
 * @throws TravaOcupada se outro processo nao soltar dentro de `esperaMs`.
 */
export async function adquirir(quem: string, esperaMs = ESPERA_PADRAO_MS): Promise<string | null> {
  const limite = Date.now() + esperaMs;
  for (;;) {
    let marca: string;
    try {
      marca = await ler();
    } catch (e) {
      console.error("[lock] celula _LOCK inacessivel; escrita bloqueada:", e);
      throw new TravaOcupada("controle de gravacao indisponivel");
    }
    const { quem: dono, quando } = partes(marca);
    const vencida = quando !== null && Date.now() - quando.getTime() > TTL_MS;
    if (!marca || vencida) {
      if (vencida) console.warn(`[lock] trava vencida de ${dono} — assumindo`);
      const token = Math.random().toString(36).slice(2, 14);
      await writeRange(CEL_LOCK, [[`${token}|${quem}|${new Date().toISOString()}`]]);
      await dormir(ASSENTAR_MS);
      if (partes(await ler()).token === token) return token;
      console.info("[lock] perdi a disputa da trava — tentando de novo");
    }
    if (Date.now() >= limite) throw new TravaOcupada(dono || "outro processo");
    await dormir(INTERVALO_MS);
  }
}

/** Libera a trava se ela ainda for nossa (nunca rouba a de outro). */
export async function liberar(token: string | null): Promise<void> {
  if (!token) return;
  try {
    if (partes(await ler()).token !== token) {
      console.warn(`[lock] trava nao era mais nossa (${token}) — nao vou limpar`);
      return;
    }
    await writeRange(CEL_LOCK, [[""]]);
  } catch (e) {
    // Falhar aqui nao pode derrubar uma gravacao ja feita: o TTL resolve.
    console.error(`[lock] falha ao liberar ${token} (TTL limpa em 15 min):`, e);
  }
}

/** Roda `fn` com a planilha travada, liberando mesmo se `fn` estourar. */
export async function comTrava<T>(
  quem: string,
  fn: () => Promise<T>,
  esperaMs = ESPERA_PADRAO_MS,
): Promise<T> {
  const token = await adquirir(quem, esperaMs);
  try {
    return await fn();
  } finally {
    await liberar(token);
  }
}
