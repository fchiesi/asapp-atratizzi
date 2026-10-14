import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasCapability, type Capability } from "@/lib/roles";
import type { Session } from "next-auth";
import { ErroNegocio } from "@/lib/erros";

/**
 * Helpers compartilhados pelas API routes.
 *
 * Padrao das rotas: auth -> capability check -> parse body -> chama
 * tool/handler -> retorna JSON. Antes desse helper, cada rota repetia
 * ~15 linhas dessa cadeia.
 */

export interface AuthOk {
  session: Session & { user: NonNullable<Session["user"]> };
}

/**
 * Garante usuario logado E com a capability. Retorna a session ou um
 * NextResponse com 401/403 que a rota deve retornar diretamente.
 *
 * Uso:
 *   const guard = await requireAuth("view_financial");
 *   if (guard instanceof NextResponse) return guard;
 *   const { session } = guard;
 */
export async function requireAuth(
  capability?: Capability,
): Promise<AuthOk | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  if (capability && !hasCapability(session.user.role, capability)) {
    return NextResponse.json(
      { error: `Sem permissao: requer capability '${capability}'` },
      { status: 403 },
    );
  }
  return { session: session as AuthOk["session"] };
}

/**
 * Recebe a string JSON que tools retornam e converte em NextResponse.
 * Se a string contem {error}, devolve status 400. Caso contrario, 200.
 */
export function toolResponse(rawJson: string): NextResponse {
  try {
    const data = JSON.parse(rawJson);
    if (data && typeof data === "object" && "error" in data) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Resposta invalida da tool (nao eh JSON)" },
      { status: 500 },
    );
  }
}

/**
 * Parse seguro do body JSON da request. Retorna ou o objeto, ou um
 * NextResponse 400 que a rota deve retornar.
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  req: Request,
): Promise<T | NextResponse> {
  try {
    return (await req.json()) as T;
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
}

/**
 * Roda a acao e converte erro em resposta: ErroNegocio -> 400 com a
 * mensagem (o usuario corrige), qualquer outro -> 500 (logado).
 */
export async function executar(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (err) {
    if (err instanceof ErroNegocio) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api] erro:", msg, err instanceof Error ? err.stack : "");
    return NextResponse.json({ error: `Erro interno: ${msg}` }, { status: 500 });
  }
}

/** Quem esta gravando (vai nas colunas CRIADO_POR / OPERADOR). */
export function quem(session: AuthOk["session"]): string {
  return session.user.email ?? "desconhecido";
}
