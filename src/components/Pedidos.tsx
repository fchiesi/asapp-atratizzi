"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Pedido } from "@/lib/comercial";
import {
  brl,
  MAQUINA_LABEL,
  MAQUINAS,
  metrosFmt,
  servicoPorId,
  STATUS_PEDIDO,
  STATUS_PEDIDO_LABEL,
  type StatusPedido,
} from "@/lib/config";
import { api } from "@/lib/cliente-api";
import { Aviso, Botao, Cabecalho, Card, Carregando, Etiqueta, inputCls, Numero, Pagina } from "./ui";

const COR: Record<StatusPedido, "cinza" | "verde" | "vermelho" | "amarelo" | "azul"> = {
  aguardando_tecido: "amarelo",
  na_fila: "azul",
  em_producao: "azul",
  acabamento: "azul",
  pronto: "verde",
  entregue: "cinza",
  cancelado: "vermelho",
};

export function Pedidos({ podeEditar }: { podeEditar: boolean }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [filtro, setFiltro] = useState<"abertos" | "todos">("abertos");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ pedidos: Pedido[] }>(`/api/pedidos${filtro === "abertos" ? "?abertos=1" : ""}`);
      setPedidos(r.pedidos);
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }, [filtro]);

  useEffect(() => {
    queueMicrotask(carregar);
  }, [carregar]);

  async function alterar(id: string, alt: Record<string, string>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(id);
    setMsg(null);
    try {
      await api("/api/pedidos", { method: "PATCH", body: { id, ...alt } });
      setMsg({ tipo: "ok", texto: `Pedido ${id} atualizado.` });
      await carregar();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (pedidos ?? []).filter((p) => !q || p.cliente.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }, [pedidos, busca]);

  const abertos = (pedidos ?? []).filter((p) => p.status !== "entregue" && p.status !== "cancelado");
  const metrosAbertos = abertos.reduce((s, p) => s + Math.max(0, p.metros - p.metrosImpressos), 0);
  const atrasados = abertos.filter((p) => p.atrasado).length;

  return (
    <Pagina>
      <Cabecalho titulo="Pedidos" subtitulo="Do tecido recebido ate a entrega" />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Numero rotulo="Pedidos abertos" valor={abertos.length} />
        <Numero rotulo="Metros a imprimir" valor={metrosFmt(metrosAbertos)} />
        <Numero rotulo="Atrasados" valor={atrasados} tom={atrasados ? "alerta" : "ok"} />
      </div>

      {msg && (
        <div className="mb-4">
          <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
        </div>
      )}

      <Card
        titulo={
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <span>Lista</span>
            <div className="flex gap-2">
              <input
                placeholder="Buscar cliente ou numero"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={`${inputCls} w-48 py-1`}
              />
              <select
                value={filtro}
                onChange={(e) => setFiltro(e.target.value as "abertos" | "todos")}
                className={`${inputCls} w-auto py-1`}
              >
                <option value="abertos">Abertos</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>
        }
      >
        {!pedidos ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum pedido. Pedidos nascem da aprovacao de um orcamento.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {lista.map((p) => {
              const pct = p.metros ? Math.min(p.metrosImpressos / p.metros, 1) : 0;
              const fechado = p.status === "entregue" || p.status === "cancelado";
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.id} · {p.cliente} <Etiqueta cor={COR[p.status]}>{STATUS_PEDIDO_LABEL[p.status]}</Etiqueta>{" "}
                        {p.urgente && <Etiqueta cor="vermelho">urgente</Etiqueta>}{" "}
                        {p.atrasado && <Etiqueta cor="vermelho">atrasado</Etiqueta>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {servicoPorId(p.servico)?.nome ?? p.servico}
                        {p.tecido && ` · ${p.tecido}`} · {p.estampas} estampa(s) · {brl(p.valorLiquido)}
                        {p.descontoAmostra > 0 && ` (amostra -${brl(p.descontoAmostra)})`} · prazo {p.prazo || "—"}
                        {p.dataEntrega && ` · entregue ${p.dataEntrega}`}
                        {p.nf && ` · NF ${p.nf}`}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 w-40 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                          <div className="h-full bg-teal-600" style={{ width: `${pct * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums">
                          {metrosFmt(p.metrosImpressos)} de {metrosFmt(p.metros)}
                        </span>
                      </div>
                    </div>
                    {podeEditar && !fechado && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          aria-label="Status"
                          value={p.status}
                          disabled={ocupado === p.id}
                          onChange={(e) => alterar(p.id, { status: e.target.value })}
                          className={`${inputCls} w-auto py-1.5`}
                        >
                          {STATUS_PEDIDO.filter((s) => s !== "entregue").map((s) => (
                            <option key={s} value={s}>
                              {STATUS_PEDIDO_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Maquina"
                          value={p.maquina}
                          disabled={ocupado === p.id}
                          onChange={(e) => alterar(p.id, { maquina: e.target.value })}
                          className={`${inputCls} w-auto py-1.5`}
                        >
                          <option value="">Maquina...</option>
                          {MAQUINAS.map((m) => (
                            <option key={m} value={m}>
                              {MAQUINA_LABEL[m]}
                            </option>
                          ))}
                        </select>
                        <Botao
                          disabled={ocupado === p.id}
                          onClick={() => {
                            const nf = window.prompt("Numero da NF (deixe vazio se ainda nao tem):", p.nf) ?? null;
                            if (nf === null) return;
                            alterar(
                              p.id,
                              { status: "entregue", nf },
                              `Marcar ${p.id} como ENTREGUE? As contas a receber do pedido sao atualizadas.`,
                            );
                          }}
                        >
                          Entregue
                        </Botao>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Pagina>
  );
}
