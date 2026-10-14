import { NextResponse } from "next/server";
import { executar, parseJsonBody, quem, requireAuth } from "@/lib/api-helpers";
import { criarOrcamento, listarOrcamentos, type NovoOrcamento } from "@/lib/comercial";

export const runtime = "nodejs";

/** GET /api/orcamentos?status=&cliente= */
export async function GET(req: Request) {
  const guard = await requireAuth("view_pedidos");
  if (guard instanceof NextResponse) return guard;
  const sp = new URL(req.url).searchParams;
  return executar(async () => ({
    orcamentos: await listarOrcamentos({
      status: sp.get("status") ?? undefined,
      cliente: sp.get("cliente") ?? undefined,
    }),
  }));
}

/** POST /api/orcamentos  body: NovoOrcamento */
export async function POST(req: Request) {
  const guard = await requireAuth("write_pedidos");
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody<NovoOrcamento>(req);
  if (body instanceof NextResponse) return body;
  return executar(() => criarOrcamento(body, quem(guard.session)));
}
