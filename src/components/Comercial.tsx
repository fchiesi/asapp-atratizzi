"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Cliente, Orcamento } from "@/lib/comercial";
import {
  avisosMinimo,
  brl,
  CONDICAO_LABEL,
  metrosFmt,
  precoSugerido,
  SERVICOS,
  servicoPorId,
  TECIDOS,
  VALOR_AMOSTRA,
} from "@/lib/config";
import { api } from "@/lib/cliente-api";
import { ClienteNovo, EscolherCliente } from "./ClienteNovo";
import { Aviso, Botao, Cabecalho, Campo, Card, Carregando, Etiqueta, inputCls, Pagina } from "./ui";

const COR_STATUS: Record<string, "cinza" | "verde" | "vermelho" | "amarelo" | "azul"> = {
  aberto: "azul",
  amostra: "amarelo",
  aprovado: "verde",
  pedido: "verde",
  perdido: "vermelho",
};

export function Comercial({ podeEditar }: { podeEditar: boolean }) {
  const [aba, setAba] = useState<"orcamentos" | "clientes">("orcamentos");
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [orcs, setOrcs] = useState<Orcamento[] | null>(null);
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [filtro, setFiltro] = useState<string>("ativos");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([
        api<{ clientes: Cliente[] }>("/api/clientes"),
        api<{ orcamentos: Orcamento[] }>("/api/orcamentos"),
      ]);
      setClientes(c.clientes);
      setOrcs(o.orcamentos);
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(carregar);
  }, [carregar]);

  async function acao(id: string, acao: "amostra" | "aprovar" | "perdido") {
    let motivo = "";
    if (acao === "perdido") {
      motivo = window.prompt("Motivo da perda (preco, prazo, sumiu...)") ?? "";
    }
    if (acao === "amostra" && !window.confirm(`Registrar amostra cobrada de ${brl(VALOR_AMOSTRA)} para ${id}?`)) return;
    if (acao === "aprovar" && !window.confirm(`Aprovar ${id} e gerar o pedido?`)) return;
    setOcupado(id);
    setMsg(null);
    try {
      const r = await api<{ pedidoId?: string; avisos?: string[] }>("/api/orcamentos/acao", {
        body: { id, acao, motivo },
      });
      const extra = r.avisos?.length ? ` ${r.avisos.join(" ")}` : "";
      setMsg({
        tipo: "ok",
        texto:
          acao === "aprovar"
            ? `Pedido ${r.pedidoId} criado.${extra}`
            : acao === "amostra"
              ? `Amostra registrada; conta a receber de ${brl(VALOR_AMOSTRA)} criada.`
              : `${id} marcado como perdido.`,
      });
      await carregar();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  const lista = useMemo(() => {
    if (!orcs) return [];
    if (filtro === "ativos") return orcs.filter((o) => o.status === "aberto" || o.status === "amostra");
    if (filtro === "todos") return orcs;
    return orcs.filter((o) => o.status === filtro);
  }, [orcs, filtro]);

  return (
    <Pagina>
      <Cabecalho
        titulo="Orcamentos e clientes"
        subtitulo="Orcamento → amostra cobrada → aprovacao → pedido"
        acoes={
          <div className="flex gap-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
            {(["orcamentos", "clientes"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAba(a)}
                className={`px-3 py-1.5 rounded-md text-sm ${aba === a ? "bg-white dark:bg-gray-950 shadow font-medium" : "text-gray-600 dark:text-gray-400"}`}
              >
                {a === "orcamentos" ? "Orcamentos" : "Clientes"}
              </button>
            ))}
          </div>
        }
      />

      {msg && (
        <div className="mb-4">
          <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
        </div>
      )}

      {aba === "orcamentos" && (
        <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
          {podeEditar && (
            <NovoOrcamento
              clientes={clientes}
              onClienteNovo={(c) => setClientes((l) => [...(l ?? []), c].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")))}
              onCriado={(t) => {
                setMsg({ tipo: "ok", texto: t });
                carregar();
              }}
              onErro={(t) => setMsg({ tipo: "erro", texto: t })}
            />
          )}
          <Card
            titulo={
              <div className="flex items-center justify-between gap-2">
                <span>Orcamentos</span>
                <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${inputCls} w-auto py-1`}>
                  <option value="ativos">Abertos e amostras</option>
                  <option value="pedido">Viraram pedido</option>
                  <option value="perdido">Perdidos</option>
                  <option value="todos">Todos</option>
                </select>
              </div>
            }
          >
            {!orcs ? (
              <Carregando />
            ) : lista.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum orcamento neste filtro.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {lista.map((o) => (
                  <li key={o.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {o.id} · {o.cliente} <Etiqueta cor={COR_STATUS[o.status] ?? "cinza"}>{o.status}</Etiqueta>
                        {o.urgente && <Etiqueta cor="vermelho">urgente</Etiqueta>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {o.data} · {servicoPorId(o.servico)?.nome ?? o.servico}
                        {o.tecido && ` · ${o.tecido}`} · {metrosFmt(o.metros)} × {brl(o.precoM)} ={" "}
                        <b>{brl(o.valor)}</b>
                        {o.pedidoId && ` · pedido ${o.pedidoId}`}
                      </p>
                      {o.obs && <p className="text-xs text-gray-500 mt-0.5">{o.obs}</p>}
                    </div>
                    {podeEditar && (o.status === "aberto" || o.status === "amostra") && (
                      <div className="flex gap-2">
                        {o.status === "aberto" && (
                          <Botao tipo="secundario" disabled={ocupado === o.id} onClick={() => acao(o.id, "amostra")}>
                            Amostra
                          </Botao>
                        )}
                        <Botao disabled={ocupado === o.id} onClick={() => acao(o.id, "aprovar")}>
                          Aprovar
                        </Botao>
                        <Botao tipo="perigo" disabled={ocupado === o.id} onClick={() => acao(o.id, "perdido")}>
                          Perdido
                        </Botao>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {aba === "clientes" && (
        <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
          {podeEditar && (
            <Card titulo="Novo cliente">
              <ClienteNovo
                onCriado={(c) => {
                  setMsg({ tipo: "ok", texto: `Cliente ${c.nome} cadastrado (${c.id}).` });
                  carregar();
                }}
              />
            </Card>
          )}
          <Card titulo={`Clientes (${clientes?.length ?? 0})`}>
            {!clientes ? (
              <Carregando />
            ) : clientes.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum cliente cadastrado ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {clientes.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <p className="font-medium">
                      {c.nome} <span className="text-xs text-gray-500">{c.id}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {[c.cidade, c.contato, c.telefone, c.email].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {CONDICAO_LABEL[c.condicao]}
                      {c.vendedor && ` · vendedor ${c.vendedor}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </Pagina>
  );
}

function NovoOrcamento({
  clientes,
  onClienteNovo,
  onCriado,
  onErro,
}: {
  clientes: Cliente[] | null;
  onClienteNovo: (c: Cliente) => void;
  onCriado: (msg: string) => void;
  onErro: (msg: string) => void;
}) {
  const [clienteId, setClienteId] = useState("");
  const [servico, setServico] = useState(SERVICOS[0].id);
  const [tecido, setTecido] = useState<string>("tricoline");
  const [estampas, setEstampas] = useState("1");
  const [metros, setMetros] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [preco, setPreco] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const sugerido = precoSugerido(servico, urgente);
  const precoFinal = Number(preco.replace(",", ".")) || sugerido;
  const m = Number(metros.replace(",", ".")) || 0;
  const avisos = m ? avisosMinimo(servico, m, Number(estampas) || 1) : [];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api<{ id: string; valor: number; avisos: string[] }>("/api/orcamentos", {
        body: {
          clienteId,
          servico,
          tecido,
          estampas: Number(estampas) || 1,
          metros: m,
          precoM: precoFinal,
          urgente,
          obs,
        },
      });
      onCriado(`Orcamento ${r.id} criado: ${brl(r.valor)}.${r.avisos.length ? " " + r.avisos.join(" ") : ""}`);
      setMetros("");
      setPreco("");
      setObs("");
    } catch (err) {
      onErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card titulo="Novo orcamento">
      <form onSubmit={salvar} className="space-y-3">
        <EscolherCliente clientes={clientes} value={clienteId} onChange={setClienteId} onClienteNovo={onClienteNovo} />
        <Campo rotulo="Servico">
          <select value={servico} onChange={(e) => setServico(e.target.value)} className={inputCls}>
            {SERVICOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">{servicoPorId(servico)?.faixa}</p>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Tecido">
            <select value={tecido} onChange={(e) => setTecido(e.target.value)} className={inputCls}>
              {TECIDOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Estampas">
            <input inputMode="numeric" value={estampas} onChange={(e) => setEstampas(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Metros">
            <input required inputMode="decimal" value={metros} onChange={(e) => setMetros(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo={`Preco/m (sugerido ${brl(sugerido)})`}>
            <input
              inputMode="decimal"
              placeholder={String(sugerido).replace(".", ",")}
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className={inputCls}
            />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
          Urgente (48-72 h, +20%)
        </label>
        <Campo rotulo="Observacao">
          <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
        </Campo>
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm">
            Total <b className="tabular-nums">{brl(m * precoFinal)}</b>
          </p>
          <Botao type="submit" disabled={salvando || !clienteId || !m}>
            {salvando ? "Salvando..." : "Criar orcamento"}
          </Botao>
        </div>
        {avisos.map((a) => (
          <Aviso key={a} tipo="info">
            {a}
          </Aviso>
        ))}
      </form>
    </Card>
  );
}
