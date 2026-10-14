/**
 * fetch das telas: devolve o JSON ou lanca Error com a mensagem da API
 * (as APIs respondem {error} em 400/403/500).
 */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Resposta invalida do servidor (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg ?? `Erro HTTP ${res.status}`);
  }
  return data as T;
}

/** "AAAA-MM" -> "outubro de 2026" */
export function nomeMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "AAAA-MM" +/- n meses */
export function deslocarMes(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
