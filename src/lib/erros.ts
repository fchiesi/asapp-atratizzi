/**
 * Erro de regra de negocio (dado faltando, status que nao permite a acao).
 * As APIs devolvem 400 com a mensagem; o chat repassa ao usuario.
 * Qualquer outro erro e' tecnico (500).
 */
export class ErroNegocio extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ErroNegocio";
  }
}

export function exigir(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ErroNegocio(msg);
}

export function numeroPositivo(v: unknown, campo: string): number {
  const x = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  exigir(Number.isFinite(x) && x > 0, `${campo} deve ser um numero maior que zero.`);
  return x;
}

export function texto(v: unknown): string {
  return String(v ?? "").trim();
}
