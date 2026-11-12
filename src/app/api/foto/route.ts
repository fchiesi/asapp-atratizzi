import { NextResponse } from "next/server";
import { executar, parseJsonBody, requireAuth } from "@/lib/api-helpers";
import { CAPABILITY_FOTO, lerFoto, TIPOS_FOTO, type TipoFoto } from "@/lib/leitura-foto";
import { ErroNegocio } from "@/lib/erros";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  tipo: TipoFoto;
  /** conteudo do arquivo em base64, sem o prefixo "data:...;base64," */
  arquivo: string;
  mediaType: string;
}

/**
 * POST /api/foto  body: { tipo, arquivo (base64), mediaType }
 * Le o documento e devolve os campos para conferencia. Nao grava nada.
 */
export async function POST(req: Request) {
  const body = await parseJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;
  if (!(TIPOS_FOTO as readonly string[]).includes(body.tipo)) {
    return NextResponse.json({ error: "Tipo de documento invalido." }, { status: 400 });
  }
  // so le quem pode gravar o resultado
  const guard = await requireAuth(CAPABILITY_FOTO[body.tipo]);
  if (guard instanceof NextResponse) return guard;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Leitura por foto nao configurada no servidor." }, { status: 500 });
  }
  return executar(async () => {
    if (typeof body.arquivo !== "string") throw new ErroNegocio("Arquivo invalido.");
    return lerFoto(body.tipo, body.arquivo, String(body.mediaType));
  });
}
