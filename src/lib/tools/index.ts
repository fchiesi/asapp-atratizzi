import type Anthropic from "@anthropic-ai/sdk";
import { canUseTool, type Role } from "@/lib/roles";
import { ErroNegocio } from "@/lib/erros";
import { listarClientes, listarOrcamentos, listarPedidos } from "@/lib/comercial";
import {
  lancarGasto,
  lancarRecebimento,
  liquidar,
  listarGastos,
  listarRecebimentos,
} from "@/lib/financeiro";
import { painelProducao } from "@/lib/producao";
import { indicadoresDoMes } from "@/lib/metas";
import { lerTabela, mesAtual, noMes } from "@/lib/planilha";
import { CATEGORIAS_GASTO, STATUS_ORCAMENTO, STATUS_PEDIDO } from "@/lib/config";

/**
 * Tools do chat. Cada uma e' um invólucro fino sobre as MESMAS funcoes que
 * as telas usam (src/lib/comercial, financeiro, producao, metas): chat e
 * tela seguem as mesmas regras e validacoes.
 *
 * Pra adicionar tool: entrada em TOOLS + capability em roles.ts
 * (TOOL_CAPABILITY), senao so a diretoria enxerga.
 */

export interface ToolContext {
  role?: Role | null;
  email?: string | null;
}

type Tool = Anthropic.Beta.BetaTool;
type Handler = (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

const LIMITE = 40;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const mesArg = { type: "string", description: "Mes AAAA-MM (ex: 2026-11). Opcional." } as const;

function corta<T>(lista: T[]): { total: number; linhas: T[]; truncado: boolean } {
  return { total: lista.length, linhas: lista.slice(0, LIMITE), truncado: lista.length > LIMITE };
}

const TOOLS: Record<string, { definition: Tool; handler: Handler }> = {
  consultar_pedidos: {
    definition: {
      name: "consultar_pedidos",
      description:
        "Lista pedidos com metros pedidos, metros ja impressos, valor, prazo, status e se esta atrasado. Use para status de pedido, fila e entregas.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: [...STATUS_PEDIDO] },
          abertos: { type: "boolean", description: "So pedidos nao entregues/cancelados." },
          cliente: { type: "string", description: "Nome (parte) ou ID do cliente." },
        },
      },
    },
    handler: async (i) =>
      corta(await listarPedidos({ status: s(i.status), abertos: i.abertos === true, cliente: s(i.cliente) })),
  },
  consultar_orcamentos: {
    definition: {
      name: "consultar_orcamentos",
      description: "Lista orcamentos e amostras (aberto, amostra, aprovado, perdido, pedido).",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: [...STATUS_ORCAMENTO] },
          cliente: { type: "string" },
        },
      },
    },
    handler: async (i) => corta(await listarOrcamentos({ status: s(i.status), cliente: s(i.cliente) })),
  },
  consultar_clientes: {
    definition: {
      name: "consultar_clientes",
      description: "Busca clientes por nome, documento, cidade ou contato.",
      input_schema: { type: "object", properties: { busca: { type: "string" } } },
    },
    handler: async (i) => corta(await listarClientes(s(i.busca))),
  },
  consultar_producao: {
    definition: {
      name: "consultar_producao",
      description:
        "Situacao da producao: por maquina (R1/R2) metros impressos hoje, flush feito hoje, horas paradas hoje, dias sem rodar; fila de pedidos abertos; ultimos apontamentos. Com `mes`, devolve tambem as paradas do mes.",
      input_schema: { type: "object", properties: { mes: mesArg } },
    },
    handler: async (i) => {
      const painel = await painelProducao();
      const mes = s(i.mes);
      if (!mes) return painel;
      const paradas = (await lerTabela("PARADAS")).filter((p) => noMes(p.DATA, mes));
      return { ...painel, paradasDoMes: paradas };
    },
  },
  consultar_gastos: {
    definition: {
      name: "consultar_gastos",
      description: "Contas a pagar / gastos. Status atrasado e' calculado (aberto e vencido).",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["aberto", "pago", "abono", "atrasado"] },
          mes: { ...mesArg, description: "Mes do vencimento AAAA-MM." },
          credor: { type: "string" },
          categoria: { type: "string", enum: [...CATEGORIAS_GASTO] },
        },
      },
    },
    handler: async (i) => {
      const l = await listarGastos({ status: s(i.status), mes: s(i.mes), credor: s(i.credor), categoria: s(i.categoria) });
      return { ...corta(l), valor_total: l.reduce((a, g) => a + g.valor, 0) };
    },
  },
  consultar_recebimentos: {
    definition: {
      name: "consultar_recebimentos",
      description:
        "Contas a receber (entrada 50%, saldo 50%, amostra, boleto 28 dias, avulso). Status atrasado = inadimplente.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["aberto", "recebido", "abono", "atrasado"] },
          mes: { ...mesArg, description: "Mes do vencimento AAAA-MM." },
          cliente: { type: "string" },
        },
      },
    },
    handler: async (i) => {
      const l = await listarRecebimentos({ status: s(i.status), mes: s(i.mes), cliente: s(i.cliente) });
      return { ...corta(l), valor_total: l.reduce((a, r) => a + r.valor, 0) };
    },
  },
  indicadores_mes: {
    definition: {
      name: "indicadores_mes",
      description:
        "Indicadores do mes contra a meta: metros faturados, preco medio, conversao de amostra, paradas da R1, perdas, entregas no prazo, inadimplencia, resultado de caixa, ponto de equilibrio. Base do relatorio mensal aos socios.",
      input_schema: { type: "object", properties: { mes: mesArg } },
    },
    handler: async (i) => indicadoresDoMes(s(i.mes) ?? mesAtual()),
  },
  lancar_gasto: {
    definition: {
      name: "lancar_gasto",
      description: "Grava um gasto (conta a pagar). Confirme com o usuario antes.",
      input_schema: {
        type: "object",
        properties: {
          categoria: { type: "string", enum: [...CATEGORIAS_GASTO] },
          credor: { type: "string" },
          valor: { type: "number" },
          data_venc: { type: "string", description: "DD/MM/AAAA" },
          descricao: { type: "string" },
          nf: { type: "string" },
          pago: { type: "boolean", description: "Ja foi pago hoje." },
        },
        required: ["categoria", "credor", "valor", "data_venc"],
      },
    },
    handler: (i, ctx) =>
      lancarGasto(
        {
          categoria: String(i.categoria),
          credor: String(i.credor),
          valor: Number(i.valor),
          dataVenc: String(i.data_venc),
          descricao: s(i.descricao),
          nf: s(i.nf),
          pago: i.pago === true,
        },
        ctx.email ?? "chat",
        "ia",
      ),
  },
  lancar_recebimento: {
    definition: {
      name: "lancar_recebimento",
      description: "Grava uma conta a receber avulsa. Confirme com o usuario antes.",
      input_schema: {
        type: "object",
        properties: {
          cliente: { type: "string" },
          valor: { type: "number" },
          data_venc: { type: "string", description: "DD/MM/AAAA" },
          pedido_id: { type: "string" },
          nf: { type: "string" },
          obs: { type: "string" },
        },
        required: ["cliente", "valor", "data_venc"],
      },
    },
    handler: (i, ctx) =>
      lancarRecebimento(
        {
          cliente: String(i.cliente),
          valor: Number(i.valor),
          dataVenc: String(i.data_venc),
          pedidoId: s(i.pedido_id),
          nf: s(i.nf),
          obs: s(i.obs),
        },
        ctx.email ?? "chat",
        "ia",
      ),
  },
  marcar_pago: {
    definition: {
      name: "marcar_pago",
      description:
        "Marca um gasto como pago ou um recebimento como recebido. Busque o ID antes com consultar_*. Confirme com o usuario antes.",
      input_schema: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["gasto", "recebimento"] },
          id: { type: "string" },
          data: { type: "string", description: "DD/MM/AAAA; default hoje" },
        },
        required: ["tipo", "id"],
      },
    },
    handler: async (i) => {
      await liquidar(i.tipo === "recebimento" ? "recebimento" : "gasto", String(i.id), { data: s(i.data) });
      return { sucesso: true };
    },
  },
};

export function getToolsForRole(role: Role | undefined | null): Tool[] {
  return Object.entries(TOOLS)
    .filter(([name]) => canUseTool(role, name))
    .map(([, t]) => t.definition);
}

/** Executa a tool e devolve JSON (string). Erro vira {"error": ...}. */
export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<string> {
  const tool = TOOLS[name];
  if (!tool) return JSON.stringify({ error: `Tool '${name}' nao encontrada` });
  // defesa em profundidade: a lista ja vem filtrada, mas confere de novo
  if (!canUseTool(ctx.role, name)) {
    return JSON.stringify({ error: `Tool '${name}' nao disponivel pro seu perfil` });
  }
  try {
    const out = await tool.handler((input ?? {}) as Record<string, unknown>, ctx);
    return JSON.stringify(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: err instanceof ErroNegocio ? msg : `Erro ao executar tool: ${msg}` });
  }
}
