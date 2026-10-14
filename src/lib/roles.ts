/**
 * Roles + capabilities do ASApp (mesma filosofia do SApp).
 *
 * - Role = papel da pessoa na operacao Atratizzi (Proposta Operacional v6,
 *   pagina "Divisao de tarefas").
 * - Capability = permissao granular. Telas, APIs e tools do chat sao gateadas
 *   por capability, nunca por role direto.
 *
 * Como definir o role de um usuario:
 *   ALLOWED_USERS = '[{"email":"x@y.com","role":"diretoria"}, ...]'  (JSON em env var)
 */

export const ROLES = [
  "diretoria",
  "administrativo",
  "producao_lider",
  "operador",
  "vendedor",
  "socio",
] as const;

export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  "view_financial", // contas a pagar/receber, faturamento, inadimplencia
  "write_financial", // lanca gasto/recebimento, marca pago/recebido
  "view_pedidos", // ve orcamentos, amostras e pedidos
  "write_pedidos", // cria orcamento, aprova amostra, gera pedido, muda status
  "view_producao", // ve fila, metros impressos, paradas
  "production_apontamento", // aponta metros, parada, flush
  "view_estoque", // saldos de tinta, tecido e insumos
  "write_estoque", // entrada, saida/consumo e ajuste de estoque; cadastro de item
  "view_metas", // painel de metas e relatorio mensal
  "use_chat", // chat com IA
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * - diretoria: Fernando (diretor de gestao e vendas). Tudo.
 * - administrativo: Costa. Compras, contas a pagar/receber, pedidos, estoque.
 * - producao_lider: Junior (responsavel tecnico). Fila, apontamento, paradas,
 *   estoque, e pode mudar status de pedido. Sem financeiro.
 * - operador: operador de impressao / auxiliares. Apontamento e estoque
 *   (consumo de tinta, recebimento de tecido).
 * - vendedor: vendedor externo comissionado. Clientes, orcamentos, amostras
 *   e pedidos. Sem financeiro geral.
 * - socio: Sublipaper (Toninho e Nanci). Leitura: metas, relatorio,
 *   financeiro, pedidos e estoque. Nao grava nada.
 */
export const CAPABILITIES_BY_ROLE: Record<Role, readonly Capability[]> = {
  diretoria: [...CAPABILITIES],
  administrativo: [
    "view_financial",
    "write_financial",
    "view_pedidos",
    "write_pedidos",
    "view_producao",
    "view_estoque",
    "write_estoque",
    "view_metas",
  ],
  producao_lider: [
    "view_pedidos",
    "write_pedidos",
    "view_producao",
    "production_apontamento",
    "view_estoque",
    "write_estoque",
  ],
  operador: ["view_producao", "production_apontamento", "view_estoque", "write_estoque"],
  vendedor: ["view_pedidos", "write_pedidos"],
  socio: ["view_financial", "view_pedidos", "view_producao", "view_estoque", "view_metas"],
};

/**
 * Tool do chat -> capability requerida. Tool sem entrada aqui so a
 * diretoria usa (nao vaza acesso por padrao).
 */
export const TOOL_CAPABILITY: Record<string, Capability> = {
  consultar_gastos: "view_financial",
  consultar_recebimentos: "view_financial",
  lancar_gasto: "write_financial",
  lancar_recebimento: "write_financial",
  marcar_pago: "write_financial",
  consultar_pedidos: "view_pedidos",
  consultar_orcamentos: "view_pedidos",
  consultar_clientes: "view_pedidos",
  consultar_producao: "view_producao",
  consultar_estoque: "view_estoque",
  indicadores_mes: "view_metas",
};

export function hasCapability(
  role: Role | undefined | null,
  capability: Capability,
): boolean {
  if (!role) return false;
  return (CAPABILITIES_BY_ROLE[role] ?? []).includes(capability);
}

export function canUseTool(
  role: Role | undefined | null,
  toolName: string,
): boolean {
  if (!role) return false;
  const required = TOOL_CAPABILITY[toolName];
  if (!required) return role === "diretoria";
  return hasCapability(role, required);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABEL: Record<Role, string> = {
  diretoria: "Diretoria",
  administrativo: "Administrativo",
  producao_lider: "Responsavel tecnico",
  operador: "Operador",
  vendedor: "Vendedor",
  socio: "Socio (leitura)",
};
