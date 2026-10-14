"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Cliente, Pedido } from "@/lib/comercial";
import {
  avisosMinimo,
  brl,
  CONDICAO_50_50,
  diasPgtoPadrao,
  MAQUINA_LABEL,
  MAQUINAS,
  metrosFmt,
  precoSugerido,
  SERVICOS,
  servicoPorId,
  STATUS_PEDIDO,
  STATUS_PEDIDO_LABEL,
  TECIDOS,
  type StatusPedido,
} from "@/lib/config";
import { api } from "@/lib/cliente-api";
import { Aviso, Botao, Cabecalho, Campo, Card, Carregando, Etiqueta, inputCls, Numero, Pagina } from "./ui";

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
  const [novo, setNovo] = useState(false);

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
    return (pedidos ?? []).filter(
      (p) =>
        !q ||
        [p.cliente, p.id, p.pedCli, p.desenho].some((v) => v.toLowerCase().includes(q)),
    );
  }, [pedidos, busca]);

  const abertos = (pedidos ?? []).filter((p) => p.status !== "entregue" && p.status !== "cancelado");
  const metrosAbertos = abertos.reduce((s, p) => s + Math.max(0, p.metros - p.metrosImpressos), 0);
  const atrasados = abertos.filter((p) => p.atrasado).length;

  return (
    <Pagina>
      <Cabecalho
        titulo="Pedidos"
        subtitulo="Uma linha por desenho, agrupadas pelo numero do pedido"
        acoes={
          podeEditar && (
            <Botao onClick={() => setNovo(!novo)}>{novo ? "Fechar" : "Novo pedido"}</Botao>
          )
        }
      />

      {novo && (
        <NovoPedidoForm
          onCriado={(t) => {
            setMsg({ tipo: "ok", texto: t });
            setNovo(false);
            carregar();
          }}
          onErro={(t) => setMsg({ tipo: "erro", texto: t })}
        />
      )}

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
          <p className="text-sm text-gray-500">
            Nenhum pedido. Pedidos entram por &quot;Novo pedido&quot; ou pela aprovacao de um orcamento.
          </p>
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
                        {p.pedCli !== p.id && <span className="text-gray-500">Ped. {p.pedCli} · </span>}
                        {p.id} · {p.cliente}
                        {p.desenho && <span className="text-gray-500"> · {p.desenho}</span>}{" "}
                        <Etiqueta cor={COR[p.status]}>{STATUS_PEDIDO_LABEL[p.status]}</Etiqueta>{" "}
                        {p.urgente && <Etiqueta cor="vermelho">urgente</Etiqueta>}{" "}
                        {p.atrasado && <Etiqueta cor="vermelho">atrasado</Etiqueta>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {servicoPorId(p.servico)?.nome ?? p.servico}
                        {p.tecido && ` · ${p.tecido}`} · {p.estampas} estampa(s) · {brl(p.valorLiquido)}
                        {p.descontoAmostra > 0 && ` (amostra -${brl(p.descontoAmostra)})`} · prazo {p.prazo || "—"}
                        {p.dataEntrega && ` · entregue ${p.dataEntrega}`}
                        {p.nf && ` · NF ${p.nf}`}
                        {p.diasPgto && ` · pgto ${p.diasPgto}`}
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

interface LinhaForm {
  desenho: string;
  tecido: string;
  servico: string;
  estampas: string;
  metros: string;
  preco: string;
}

const linhaVazia = (servico: string = SERVICOS[0].id): LinhaForm => ({
  desenho: "",
  tecido: "tricoline",
  servico,
  estampas: "1",
  metros: "",
  preco: "",
});

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

/** "AAAA-MM-DD" (input date) -> "DD/MM/AAAA" */
const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

/**
 * Entrada de pedido no modelo do SApp: cabecalho (cliente, numero do pedido,
 * entrega, condicao de pagamento, representante) + uma linha por desenho.
 */
function NovoPedidoForm({ onCriado, onErro }: { onCriado: (t: string) => void; onErro: (t: string) => void }) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [pedCli, setPedCli] = useState("");
  const [prazo, setPrazo] = useState("");
  const [diasPgto, setDiasPgto] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<LinhaForm[]>([linhaVazia()]);
  const [salvando, setSalvando] = useState(false);

  const [erroClientes, setErroClientes] = useState<string | null>(null);

  // uma vez ao abrir o formulario
  useEffect(() => {
    api<{ clientes: Cliente[] }>("/api/clientes")
      .then((r) => setClientes(r.clientes))
      .catch((e) => setErroClientes(e instanceof Error ? e.message : String(e)));
  }, []);

  const cliente = clientes?.find((c) => c.id === clienteId);
  const condicao = diasPgto || (cliente ? diasPgtoPadrao(cliente.condicao) : CONDICAO_50_50);

  const set = (i: number, campo: keyof LinhaForm, v: string) =>
    setLinhas(linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));

  const precoDe = (l: LinhaForm) => num(l.preco) || precoSugerido(l.servico, urgente);
  const total = linhas.reduce((s, l) => s + num(l.metros) * precoDe(l), 0);
  const metros = linhas.reduce((s, l) => s + num(l.metros), 0);
  const avisos = linhas.flatMap((l, i) =>
    num(l.metros) ? avisosMinimo(l.servico, num(l.metros), Number(l.estampas) || 1).map((a) => `Linha ${i + 1}: ${a}`) : [],
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api<{ ids: string[]; pedCli: string; valorLiquido: number; avisos: string[] }>("/api/pedidos", {
        body: {
          clienteId,
          pedCli,
          prazo: dataBR(prazo),
          diasPgto,
          vendedor,
          urgente,
          obs,
          linhas: linhas.map((l) => ({
            desenho: l.desenho,
            tecido: l.tecido,
            servico: l.servico,
            estampas: Number(l.estampas) || 1,
            metros: num(l.metros),
            precoM: num(l.preco) || undefined,
          })),
        },
      });
      onCriado(
        `Pedido ${r.pedCli} criado: ${r.ids.length} linha(s) (${r.ids.join(", ")}), ${brl(r.valorLiquido)}.` +
          (r.avisos.length ? ` ${r.avisos.join(" ")}` : ""),
      );
    } catch (err) {
      onErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card titulo="Novo pedido" className="mb-4">
      <form onSubmit={salvar} className="space-y-4">
        {erroClientes && <Aviso tipo="erro">Nao carregou os clientes: {erroClientes}</Aviso>}
        {clientes?.length === 0 && (
          <Aviso tipo="info">Nenhum cliente cadastrado. Cadastre em Orcamentos e clientes → Clientes.</Aviso>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Campo rotulo="Cliente">
            <select required value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={inputCls}>
              <option value="">{clientes ? "Escolha..." : "Carregando..."}</option>
              {clientes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="No do pedido (do cliente)">
            <input
              value={pedCli}
              onChange={(e) => setPedCli(e.target.value)}
              placeholder="vazio = numero automatico"
              className={inputCls}
            />
          </Campo>
          <Campo rotulo="Entrega">
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Pagamento (50/50, 28, 30/60/90)">
            <input
              value={diasPgto}
              onChange={(e) => setDiasPgto(e.target.value)}
              placeholder={condicao}
              className={inputCls}
            />
          </Campo>
          <Campo rotulo="Representante">
            <input
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              placeholder={cliente?.vendedor || ""}
              className={inputCls}
            />
          </Campo>
          <Campo rotulo="Observacao">
            <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
          </Campo>
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
            Urgente (+20%)
          </label>
        </div>
        {clienteId && !prazo && (
          <p className="text-xs text-gray-500">Sem data de entrega, o prazo sai do servico (7 a 10 dias uteis).</p>
        )}

        <div className="space-y-2">
          <p className="text-xs text-gray-500">Desenhos (uma linha por desenho)</p>
          {linhas.map((l, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
              <Campo rotulo={`Desenho ${i + 1}`}>
                <input value={l.desenho} onChange={(e) => set(i, "desenho", e.target.value)} className={inputCls} />
              </Campo>
              <Campo rotulo="Servico">
                <select value={l.servico} onChange={(e) => set(i, "servico", e.target.value)} className={inputCls}>
                  {SERVICOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Tecido">
                <select value={l.tecido} onChange={(e) => set(i, "tecido", e.target.value)} className={inputCls}>
                  {TECIDOS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Metros">
                <input
                  required
                  inputMode="decimal"
                  value={l.metros}
                  onChange={(e) => set(i, "metros", e.target.value)}
                  className={inputCls}
                />
              </Campo>
              <Campo rotulo={`R$/m (${brl(precoSugerido(l.servico, urgente))})`}>
                <input
                  inputMode="decimal"
                  value={l.preco}
                  onChange={(e) => set(i, "preco", e.target.value)}
                  className={inputCls}
                />
              </Campo>
              <div className="flex items-center gap-2 pb-1">
                <span className="text-sm tabular-nums">{brl(num(l.metros) * precoDe(l))}</span>
                {linhas.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remover linha ${i + 1}`}
                    onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                    className="text-rose-600 text-sm px-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          <Botao tipo="secundario" onClick={() => setLinhas([...linhas, linhaVazia(linhas.at(-1)?.servico)])}>
            + Desenho
          </Botao>
        </div>

        {avisos.map((a) => (
          <Aviso key={a} tipo="info">
            {a}
          </Aviso>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-sm">
            {linhas.length} desenho(s) · {metrosFmt(metros)} · <b className="tabular-nums">{brl(total)}</b> · pagamento{" "}
            {condicao}
          </p>
          <Botao type="submit" disabled={salvando || !clienteId || !metros}>
            {salvando ? "Gravando..." : "Gravar pedido"}
          </Botao>
        </div>
      </form>
    </Card>
  );
}
