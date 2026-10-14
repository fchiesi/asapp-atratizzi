import { NextResponse } from "next/server";
import { executar, parseJsonBody, quem, requireAuth } from "@/lib/api-helpers";
import { alterarPedido, listarPedidos, type AlteracaoPedido } from "@/lib/comercial";

export const runtime = "nodejs";

/** GET /api/pedidos?abertos=1&status=&cliente= */
export async function GET(req: Request) {
  const guard = await requireAuth("view_pedidos");
  if (guard instanceof NextResponse) return guard;
  const sp = new URL(req.url).searchParams;
  return executar(async () => ({
    pedidos: await listarPedidos({
      abertos: sp.get("abertos") === "1",
      status: sp.get("status") ?? undefined,
      cliente: sp.get("cliente") ?? undefined,
    }),
  }));
}

/** PATCH /api/pedidos  body: { id, status?, maquina?, nf?, prazo?, obs? } */
export async function PATCH(req: Request) {
  const guard = await requireAuth("write_pedidos");
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody<AlteracaoPedido & { id: string }>(req);
  if (body instanceof NextResponse) return body;
  const { id, ...alt } = body;
  return executar(async () => {
    await alterarPedido(id, alt, quem(guard.session));
    return { ok: true };
  });
}
