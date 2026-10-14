import { NextResponse } from "next/server";
import { executar, parseJsonBody, quem, requireAuth } from "@/lib/api-helpers";
import {
  apontar,
  painelProducao,
  registrarParada,
  registrarRotina,
  type NovaParada,
  type NovoApontamento,
} from "@/lib/producao";
import { ErroNegocio } from "@/lib/erros";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/producao -> fila, maquinas (metros hoje, flush, paradas), ultimos apontamentos */
export async function GET() {
  const guard = await requireAuth("view_producao");
  if (guard instanceof NextResponse) return guard;
  return executar(() => painelProducao());
}

type Body =
  | ({ tipo: "apontamento" } & NovoApontamento)
  | ({ tipo: "parada" } & NovaParada)
  | { tipo: "rotina"; maquina: string; rotina: string; obs?: string };

/** POST /api/producao  body: { tipo: "apontamento" | "parada" | "rotina", ... } */
export async function POST(req: Request) {
  const guard = await requireAuth("production_apontamento");
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;
  const q = quem(guard.session);
  return executar(async () => {
    switch (body.tipo) {
      case "apontamento":
        return apontar(body, q);
      case "parada":
        return registrarParada(body, q);
      case "rotina":
        return registrarRotina({ maquina: body.maquina, tipo: body.rotina, obs: body.obs }, q);
      default:
        throw new ErroNegocio("tipo invalido");
    }
  });
}
