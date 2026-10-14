import { NextResponse } from "next/server";
import { executar, parseJsonBody, quem, requireAuth } from "@/lib/api-helpers";
import { aprovarOrcamento, enviarAmostra, marcarPerdido } from "@/lib/comercial";
import { ErroNegocio } from "@/lib/erros";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  id: string;
  acao: "amostra" | "aprovar" | "perdido";
  prazo?: string;
  motivo?: string;
}

/** POST /api/orcamentos/acao  body: { id, acao, prazo?, motivo? } */
export async function POST(req: Request) {
  const guard = await requireAuth("write_pedidos");
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;
  const q = quem(guard.session);
  return executar(async () => {
    switch (body.acao) {
      case "amostra":
        return enviarAmostra(body.id, q);
      case "aprovar":
        return aprovarOrcamento(body.id, q, { prazo: body.prazo });
      case "perdido":
        await marcarPerdido(body.id, body.motivo ?? "");
        return { ok: true };
      default:
        throw new ErroNegocio(`Acao invalida: ${String(body.acao)}`);
    }
  });
}
