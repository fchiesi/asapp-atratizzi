import { NextResponse } from "next/server";
import { executar, parseJsonBody, quem, requireAuth } from "@/lib/api-helpers";
import {
  lancarGasto,
  lancarRecebimento,
  liquidar,
  listarGastos,
  listarRecebimentos,
  resumoFinanceiro,
  type NovoGasto,
  type NovoRecebimento,
} from "@/lib/financeiro";
import { mesAtual } from "@/lib/planilha";
import { ErroNegocio } from "@/lib/erros";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/financeiro?mes=AAAA-MM&lista=abertos|todos
 * Resumo + contas (em aberto por padrao; "todos" = tudo que vence no mes).
 */
export async function GET(req: Request) {
  const guard = await requireAuth("view_financial");
  if (guard instanceof NextResponse) return guard;
  const sp = new URL(req.url).searchParams;
  const mesParam = sp.get("mes") ?? "";
  const mes = /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual();
  const todos = sp.get("lista") === "todos";
  return executar(async () => {
    const [resumo, gastos, recebimentos] = await Promise.all([
      resumoFinanceiro(mes),
      listarGastos(todos ? { mes } : { status: "aberto" }),
      listarRecebimentos(todos ? { mes } : { status: "aberto" }),
    ]);
    return { resumo, gastos, recebimentos };
  });
}

type Body =
  | ({ acao: "gasto" } & NovoGasto)
  | ({ acao: "recebimento" } & NovoRecebimento)
  | { acao: "liquidar"; tipo: "gasto" | "recebimento"; id: string; data?: string; banco?: string };

/** POST /api/financeiro  body: { acao: "gasto" | "recebimento" | "liquidar", ... } */
export async function POST(req: Request) {
  const guard = await requireAuth("write_financial");
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;
  const q = quem(guard.session);
  return executar(async () => {
    switch (body.acao) {
      case "gasto":
        return lancarGasto(body, q);
      case "recebimento":
        return lancarRecebimento(body, q);
      case "liquidar":
        await liquidar(body.tipo, body.id, { data: body.data, banco: body.banco });
        return { ok: true };
      default:
        throw new ErroNegocio("acao invalida");
    }
  });
}
