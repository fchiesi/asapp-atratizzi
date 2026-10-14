/**
 * Cache do ultimo dado no NAVEGADOR (stale-while-revalidate), Fase 2 do
 * plano de 21/09/2026.
 *
 * A tela pinta na hora com o que foi visto da ultima vez e atualiza por
 * tras; sem isto toda abertura do dashboard/fila esperava a API do Sheets
 * (1-3 s no melhor caso, cold start da Vercel por cima).
 *
 * - "session": sessionStorage — morre quando a aba fecha. Pra dado
 *   financeiro (dashboard), que nao pode ficar num tablet compartilhado.
 * - "local": localStorage — sobrevive ao fechar/abrir (PWA no chao de
 *   fabrica). Pra fila/painel de producao.
 *
 * Tudo em try/catch: storage bloqueado (privado, cota, thumbnail) so
 * desliga o cache, nunca quebra a tela.
 */

export interface Guardado<T> {
  dados: T;
  /** epoch ms de quando foi gravado */
  em: number;
}

const PREFIXO = "asapp:cache:";

function storage(tipo: "local" | "session"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return tipo === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function lerCache<T>(
  chave: string,
  maxIdadeMs: number,
  tipo: "local" | "session" = "local",
): Guardado<T> | null {
  try {
    const s = storage(tipo);
    const raw = s?.getItem(PREFIXO + chave);
    if (!raw) return null;
    const g = JSON.parse(raw) as Guardado<T>;
    if (!g || typeof g.em !== "number") return null;
    if (Date.now() - g.em > maxIdadeMs) return null;
    return g;
  } catch {
    return null;
  }
}

export function gravarCache<T>(
  chave: string,
  dados: T,
  tipo: "local" | "session" = "local",
): void {
  try {
    const s = storage(tipo);
    s?.setItem(PREFIXO + chave, JSON.stringify({ dados, em: Date.now() } satisfies Guardado<T>));
  } catch {
    // sem espaco / bloqueado: segue sem cache
  }
}

export function limparCache(chave: string, tipo: "local" | "session" = "local"): void {
  try {
    storage(tipo)?.removeItem(PREFIXO + chave);
  } catch {
    // nada
  }
}
