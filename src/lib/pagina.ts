import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { hasCapability, type Capability, type Role } from "@/lib/roles";

/**
 * Primeira pagina que o usuario PODE abrir. Cada condicao e' a mesma que a
 * pagina de destino exige - senao uma manda pra outra em circulo.
 */
export function paginaInicial(role: Role | undefined | null): string {
  if (hasCapability(role, "view_metas")) return "/painel";
  if (hasCapability(role, "production_apontamento")) return "/producao";
  if (hasCapability(role, "view_financial")) return "/financeiro";
  if (hasCapability(role, "view_pedidos")) return "/comercial";
  return "/sem-acesso";
}

/** Usado no topo de cada pagina: exige login + capability. */
export async function exigirPagina(cap: Capability): Promise<Session & { user: NonNullable<Session["user"]> }> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasCapability(session.user.role, cap)) redirect(paginaInicial(session.user.role));
  return session as Session & { user: NonNullable<Session["user"]> };
}
