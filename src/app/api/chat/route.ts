import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/api-helpers";
import { CHAT_EFFORT, claude, DEFAULT_MODEL, FALLBACK_BETA, getSystemPrompt } from "@/lib/claude";
import { executeTool, getToolsForRole } from "@/lib/tools";

/**
 * POST /api/chat  body: { messages: [{ role: "user" | "assistant", content: string }] }
 *
 * Loop de tool use (mesmo do SApp): chama o Claude, roda as tools pedidas,
 * devolve os resultados e repete ate o texto final. Limite de 10 voltas.
 * O historico do turno e' so acrescentado (nunca editado): os blocos de
 * thinking voltam intactos entre as voltas.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_ITERATIONS = 10;

export async function POST(req: Request) {
  const guard = await requireAuth("use_chat");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;
  const role = session.user.role;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY nao configurada no servidor" }, { status: 500 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const input = body.messages;
  if (!Array.isArray(input) || input.length === 0) {
    return NextResponse.json({ error: "messages deve ser array nao vazio" }, { status: 400 });
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = input.map((m) => ({
    role: m.role,
    content: String(m.content),
  }));
  const tools = getToolsForRole(role);
  const system = getSystemPrompt(role);
  const toolCalls: Array<{ name: string; input: unknown }> = [];

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await claude.beta.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 16000,
        system,
        tools,
        messages,
        output_config: { effort: CHAT_EFFORT },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });

      if (response.stop_reason === "refusal") {
        return NextResponse.json({
          text: "Nao consigo responder esse pedido. Reformule a pergunta, por favor.",
          toolCalls,
        });
      }

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        const cortado = response.stop_reason === "max_tokens" ? "\n\n(resposta cortada por tamanho)" : "";
        return NextResponse.json({ text: (text || "(sem resposta)") + cortado, toolCalls });
      }

      const usos = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );
      // todas as respostas das tools voltam numa unica mensagem
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        usos.map(async (b) => {
          toolCalls.push({ name: b.name, input: b.input });
          const content = await executeTool(b.name, b.input, { role, email: session.user.email });
          return {
            type: "tool_result" as const,
            tool_use_id: b.id,
            content,
            is_error: content.startsWith('{"error"'),
          };
        }),
      );
      messages.push({ role: "user", content: results });
    }
    return NextResponse.json({ error: `Limite de ${MAX_ITERATIONS} voltas atingido`, toolCalls }, { status: 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[chat] erro:", msg);
    return NextResponse.json({ error: `Erro interno: ${msg}` }, { status: 500 });
  }
}
