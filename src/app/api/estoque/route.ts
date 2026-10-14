import { NextResponse } from "next/server";
import { executar, parseJsonBody, quem, requireAuth } from "@/lib/api-helpers";
import {
  alterarItem,
  criarItem,
  listarItens,
  listarMovimentos,
  movimentar,
  type NovoItem,
  type NovoMovimento,
} from "@/lib/estoque";
import { ErroNegocio } from "@/lib/erros";
import { hasCapability } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/estoque -> itens com saldo + ultimos 40 movimentos */
export async function GET() {
  const guard = await requireAuth("view_estoque");
  if (guard instanceof NextResponse) return guard;
  return executar(async () => {
    const [itens, movimentos] = await Promise.all([listarItens(), listarMovimentos()]);
    return { itens, movimentos: movimentos.slice(0, 40) };
  });
}

type Body =
  | ({ acao: "movimento" } & NovoMovimento)
  | ({ acao: "item" } & NovoItem)
  | {
      acao: "alterar_item";
      id: string;
      minimo?: number;
      custoUnit?: number;
      fornecedor?: string;
      ativo?: boolean;
      obs?: string;
    };

/** POST /api/estoque  body: { acao: "movimento" | "item" | "alterar_item", ... } */
export async function POST(req: Request) {
  const guard = await requireAuth("write_estoque");
  if (guard instanceof NextResponse) return guard;
  const body = await parseJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;
  const q = quem(guard.session);
  return executar(async () => {
    switch (body.acao) {
      case "movimento":
        // a conta a pagar e' escrita no financeiro: so quem lanca gasto
        if (body.vencimentoGasto && !hasCapability(guard.session.user.role, "write_financial")) {
          throw new ErroNegocio("Seu perfil nao lanca conta a pagar. Registre so a entrada; o administrativo lanca a conta.");
        }
        return movimentar(body, q);
      case "item":
        return criarItem(body, q);
      case "alterar_item": {
        const { id, ...alt } = body;
        await alterarItem(id, alt);
        return { ok: true };
      }
      default:
        throw new ErroNegocio("acao invalida");
    }
  });
}
