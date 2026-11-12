"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
}

const SUGESTOES = [
  "Como estamos contra a meta de metros deste mes?",
  "Quais pedidos estao atrasados?",
  "Tem cliente inadimplente?",
  "Quantas horas a Reggiani 1 ficou parada este mes?",
];

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll para o fim quando chegar mensagem nova
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Auto-focus input on mount and after send
  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  // Ctrl+K / Cmd+K to focus input from anywhere
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const text = await res.text();
      if (!text) {
        throw new Error(
          `Servidor retornou resposta vazia (status ${res.status}). Provavel timeout (120s) ou crash. Veja Vercel Logs.`,
        );
      }
      let data: { text?: string; toolCalls?: unknown[]; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Resposta invalida do servidor: ${text.slice(0, 200)}`,
        );
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Erro HTTP ${res.status}`);
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.text ?? "(sem resposta)",
          toolCalls: data.toolCalls as Array<{ name: string; input: unknown }> | undefined,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col pb-16 lg:pb-0">
      <header className="p-6 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-2xl font-bold">Chat IA</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Pergunte sobre pedidos, producao, financeiro e metas da operacao
          Atratizzi. A IA le a planilha ASApp_Atratizzi.
        </p>
      </header>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1">
              Assistente ASApp
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center max-w-sm">
              Pergunte sobre metros, pedidos, amostras, paradas ou contas.
              <br />
              <span className="text-xs opacity-70">Ctrl+K para focar no campo</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 bg-white dark:bg-gray-900 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-teal-300 dark:hover:border-teal-700 text-sm transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              IA
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl px-4 py-3 border border-gray-200 dark:border-gray-800">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">Erro na resposta</p>
                <p className="text-red-600 dark:text-red-400 mt-1">{error}</p>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setError(null);
                    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                    if (lastUserMsg) sendMessage(lastUserMsg.content);
                  }}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition"
                >
                  Tentar de novo
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950"
      >
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte algo... (Ctrl+K)"
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
          isUser ? "bg-blue-600" : "bg-teal-600"
        }`}
      >
        {isUser ? "Eu" : "IA"}
      </div>
      <div
        className={`max-w-2xl rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white whitespace-pre-wrap"
            : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <MarkdownContent text={message.content} />
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <details className="mt-2 text-xs opacity-60">
            <summary className="cursor-pointer">
              Tools usadas ({message.toolCalls.length})
            </summary>
            <pre className="mt-2 overflow-x-auto">
              {JSON.stringify(message.toolCalls, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

/** Simple markdown renderer for IA responses */
function MarkdownContent({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, bi) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Code block ```
        if (trimmed.startsWith("```")) {
          const lines = trimmed.split("\n");
          const code = lines.slice(1, lines[lines.length - 1] === "```" ? -1 : undefined).join("\n");
          return (
            <pre
              key={bi}
              className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-xs font-mono"
            >
              {code}
            </pre>
          );
        }

        // Table (lines starting with |)
        const tableLines = trimmed.split("\n").filter((l) => l.trim().startsWith("|"));
        if (tableLines.length >= 2) {
          const rows = tableLines
            .filter((l) => !l.match(/^\|[\s-:|]+\|$/))
            .map((l) =>
              l
                .split("|")
                .slice(1, -1)
                .map((c) => c.trim())
            );
          return (
            <div key={bi} className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {rows[0]?.map((cell, ci) => (
                      <th
                        key={ci}
                        className="text-left py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 font-semibold"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="py-1.5 px-2 border-b border-gray-100 dark:border-gray-800"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Heading ### ## #
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const content = headingMatch[2];
          const cls =
            level === 1
              ? "text-base font-bold"
              : level === 2
                ? "text-sm font-bold"
                : "text-sm font-semibold text-gray-700 dark:text-gray-300";
          return (
            <p key={bi} className={cls}>
              {content}
            </p>
          );
        }

        // Bullet list (- or *)
        const listLines = trimmed.split("\n");
        if (listLines.every((l) => l.match(/^\s*[-*]\s/))) {
          return (
            <ul key={bi} className="list-disc list-inside space-y-1">
              {listLines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^\s*[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        }

        // Numbered list
        if (listLines.every((l) => l.match(/^\s*\d+[.)]\s/))) {
          return (
            <ol key={bi} className="list-decimal list-inside space-y-1">
              {listLines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^\s*\d+[.)]\s/, ""))}</li>
              ))}
            </ol>
          );
        }

        // Regular paragraph - render inline formatting
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/** Render inline markdown: **bold**, *italic*, `code`, line breaks */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={match.index}>{match[3]}</em>
      );
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono"
        >
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
