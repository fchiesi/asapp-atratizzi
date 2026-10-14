import { NextResponse } from "next/server";
import { executar, parseJsonBody, quem, requireAuth } from "@/lib/api-helpers";
import { criarCliente, listarClientes, type NovoCliente } from "@/lib/comercial";

export const runtime = "nodejs";

/** GET /api/clientes?busca= */
export async function GET(req: Request) {
  const guard = await requireAuth("view_pedidos");
  if (guard instanceof NextResponse) return guard;
  const busca = new URL(req.url).searchParams.get("busca") ?? undefined;
  return executar(async () => ({ clientes: await listarClientes(busca) }));
}

/** POST /api/clientes  body: NovoCliente */
export async function POST(req: Request) {
  const guard = await requireAuth("write_pedidos");
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody<NovoCliente>(req);
  if (body instanceof NextResponse) return body;
  return executar(() => criarCliente(body, quem(guard.session)));
}
