"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lancamento, ResumoFinanceiro } from "@/lib/financeiro";
import { brl, CATEGORIAS_GASTO } from "@/lib/config";
import { api, deslocarMes, nomeMes } from "@/lib/cliente-api";
import { gravarCache, lerCache } from "@/lib/client-cache";
import { BarChart } from "./BarChart";
import { Aviso, Botao, Cabecalho, Campo, Card, Carregando, Etiqueta, inputCls, Numero, Pagina } from "./ui";

interface Dados {
  resumo: ResumoFinanceiro;
  gastos: Lancamento[];
  recebimentos: Lancamento[];
}

// sessionStorage: dado financeiro nao sobrevive num navegador compartilhado
const CACHE = "financeiro";

export function Financeiro({ mesInicial, podeEditar }: { mesInicial: string; podeEditar: boolean }) {
  const [mes, setMes] = useState(mesInicial);
  const [lista, setLista] = useState<"abertos" | "todos">("abertos");
  const [dados, setDados] = useState<Dados | null>(null);
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [form, setForm] = useState<"gasto" | "recebimento" | null>(null);

  const carregar = useCallback(async () => {
    try {
      const d = await api<Dados>(`/api/financeiro?mes=${mes}&lista=${lista}`);
      setDados(d);
      if (mes === mesInicial && lista === "abertos") gravarCache(CACHE, d, "session");
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }, [mes, lista, mesInicial]);

  useEffect(() => {
    const g = mes === mesInicial && lista === "abertos" ? lerCache<Dados>(CACHE, 30 * 60_000, "session") : null;
    queueMicrotask(() => {
      if (g) setDados((atual) => atual ?? g.dados);
      carregar();
    });
  }, [carregar, mes, mesInicial, lista]);

  async function liquidar(l: Lancamento) {
    const verbo = l.tipo === "gasto" ? "pago" : "recebido";
    if (!window.confirm(`Marcar como ${verbo} hoje: ${l.pessoa} ${brl(l.valor)}?`)) return;
    try {
      await api("/api/financeiro", { body: { acao: "liquidar", tipo: l.tipo, id: l.id } });
      setMsg({ tipo: "ok", texto: `${l.pessoa}: ${brl(l.valor)} marcado como ${verbo}.` });
      await carregar();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }

  const r = dados?.resumo;

  return (
    <Pagina>
      <Cabecalho
        titulo="Financeiro"
        subtitulo={`Conta so da operacao · ${nomeMes(mes)}`}
        acoes={
          <>
            <Botao tipo="secundario" onClick={() => setMes(deslocarMes(mes, -1))}>
              ←
            </Botao>
            <Botao tipo="secundario" onClick={() => setMes(deslocarMes(mes, 1))}>
              →
            </Botao>
            {podeEditar && (
              <>
                <Botao onClick={() => setForm(form === "gasto" ? null : "gasto")}>Lancar gasto</Botao>
                <Botao tipo="secundario" onClick={() => setForm(form === "recebimento" ? null : "recebimento")}>
                  Lancar recebimento
                </Botao>
              </>
            )}
          </>
        }
      />

      {msg && (
        <div className="mb-4">
          <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
        </div>
      )}

      {form && (
        <FormLancamento
          tipo={form}
          onFeito={(t) => {
            setMsg({ tipo: "ok", texto: t });
            setForm(null);
            carregar();
          }}
          onErro={(t) => setMsg({ tipo: "erro", texto: t })}
        />
      )}

      {!r ? (
        <Carregando />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Numero rotulo="Recebido no mes" valor={brl(r.recebidoMes)} tom="ok" />
            <Numero rotulo="Pago no mes" valor={brl(r.pagoMes)} />
            <Numero
              rotulo="Resultado de caixa"
              valor={brl(r.resultadoCaixaMes)}
              tom={r.resultadoCaixaMes < 0 ? "alerta" : "ok"}
            />
            <Numero
              rotulo="Inadimplencia"
              valor={brl(r.inadimplencia.valor)}
              detalhe={`${r.inadimplencia.qtd} conta(s) vencida(s)`}
              tom={r.inadimplencia.qtd ? "alerta" : "neutro"}
            />
            <Numero rotulo="A receber (aberto)" valor={brl(r.aReceberAberto)} />
            <Numero
              rotulo="A pagar (aberto)"
              valor={brl(r.aPagarAberto)}
              detalhe={r.gastosAtrasados.qtd ? `${r.gastosAtrasados.qtd} atrasada(s): ${brl(r.gastosAtrasados.valor)}` : undefined}
              tom={r.gastosAtrasados.qtd ? "atencao" : "neutro"}
            />
          </div>

          <Card titulo="Ultimos 6 meses (faturado · recebido · pago)">
            <BarChart data={r.evolucao} />
          </Card>

          <div className="flex justify-end">
            <select
              value={lista}
              onChange={(e) => setLista(e.target.value as "abertos" | "todos")}
              className={`${inputCls} w-auto py-1`}
            >
              <option value="abertos">Contas em aberto (todas as datas)</option>
              <option value="todos">Tudo que vence em {nomeMes(mes)}</option>
            </select>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <ListaContas titulo="A receber" itens={dados!.recebimentos} podeEditar={podeEditar} onLiquidar={liquidar} />
            <ListaContas titulo="A pagar" itens={dados!.gastos} podeEditar={podeEditar} onLiquidar={liquidar} />
          </div>
        </div>
      )}
    </Pagina>
  );
}

function ListaContas({
  titulo,
  itens,
  podeEditar,
  onLiquidar,
}: {
  titulo: string;
  itens: Lancamento[];
  podeEditar: boolean;
  onLiquidar: (l: Lancamento) => void;
}) {
  const total = itens.filter((i) => i.status === "aberto").reduce((s, i) => s + i.valor, 0);
  return (
    <Card titulo={`${titulo} · ${brl(total)} em aberto`}>
      {itens.length === 0 ? (
        <p className="text-sm text-gray-500">Nada aqui.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {itens.map((l) => (
            <li key={l.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {l.pessoa} {l.atrasado && <Etiqueta cor="vermelho">vencida</Etiqueta>}
                  {l.status !== "aberto" && <Etiqueta cor="verde">{l.status}</Etiqueta>}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  vence {l.dataVenc} · {l.categoria}
                  {l.descricao && l.descricao !== l.categoria && ` · ${l.descricao}`}
                  {l.nf && ` · NF ${l.nf}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums text-sm">{brl(l.valor)}</span>
                {podeEditar && l.status === "aberto" && (
                  <Botao tipo="secundario" onClick={() => onLiquidar(l)}>
                    {l.tipo === "gasto" ? "Pago" : "Recebido"}
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FormLancamento({
  tipo,
  onFeito,
  onErro,
}: {
  tipo: "gasto" | "recebimento";
  onFeito: (t: string) => void;
  onErro: (t: string) => void;
}) {
  const [pessoa, setPessoa] = useState("");
  const [categoria, setCategoria] = useState<string>("tinta");
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState("");
  const [descricao, setDescricao] = useState("");
  const [nf, setNf] = useState("");
  const [pago, setPago] = useState(false);
  const [salvando, setSalvando] = useState(false);

  /** input type=date (AAAA-MM-DD) -> DD/MM/AAAA */
  const br = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    try {
      const body =
        tipo === "gasto"
          ? { acao: "gasto", categoria, credor: pessoa, valor: v, dataVenc: br(venc), descricao, nf, pago }
          : { acao: "recebimento", cliente: pessoa, valor: v, dataVenc: br(venc), nf, obs: descricao };
      await api("/api/financeiro", { body });
      onFeito(`${tipo === "gasto" ? "Gasto" : "Recebimento"} de ${brl(v)} lancado.`);
    } catch (err) {
      onErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card titulo={tipo === "gasto" ? "Novo gasto" : "Novo recebimento avulso"} className="mb-4">
      <form onSubmit={salvar} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Campo rotulo={tipo === "gasto" ? "Credor" : "Cliente"}>
          <input required value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={inputCls} />
        </Campo>
        {tipo === "gasto" && (
          <Campo rotulo="Categoria">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Valor (R$)">
          <input required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Vencimento">
          <input required type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Descricao">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="NF">
          <input value={nf} onChange={(e) => setNf(e.target.value)} className={inputCls} />
        </Campo>
        {tipo === "gasto" && (
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Ja pago hoje
          </label>
        )}
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
          <Botao type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Lancar"}
          </Botao>
        </div>
      </form>
    </Card>
  );
}
