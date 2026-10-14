import { NextResponse } from "next/server";
import { executar, requireAuth } from "@/lib/api-helpers";
import { indicadoresDoMes } from "@/lib/metas";
import { mesAtual } from "@/lib/planilha";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/metas?mes=AAAA-MM -> indicadores do mes contra a meta */
export async function GET(req: Request) {
  const guard = await requireAuth("view_metas");
  if (guard instanceof NextResponse) return guard;
  const m = new URL(req.url).searchParams.get("mes") ?? "";
  return executar(() => indicadoresDoMes(/^\d{4}-\d{2}$/.test(m) ? m : mesAtual()));
}
