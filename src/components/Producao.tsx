"use client";

import { useCallback, useEffect, useState } from "react";
import type { PainelProducao } from "@/lib/producao";
import {
  CAUSA_LABEL,
  CAUSAS_PARADA,
  ETAPAS,
  MAQUINA_LABEL,
  MAQUINAS,
  metrosFmt,
  ROTINA_LABEL,
  STATUS_PEDIDO_LABEL,
  type Maquina,
  type TipoRotina,
} from "@/lib/config";
import { api } from "@/lib/cliente-api";
import { gravarCache, lerCache } from "@/lib/client-cache";
import { Aviso, Botao, Cabecalho, Campo, Card, Carregando, Etiqueta, inputCls, Pagina } from "./ui";

const CACHE = "producao";
const ATUALIZA_MS = 60_000;

/**
 * Tela do chao de fabrica (celular): metros por maquina hoje, ultimo flush,
 * apontamento, parada e fila. Atualiza sozinha a cada minuto e pinta na hora
 * com o ultimo dado visto (cache local, igual ao SApp).
 */
export function Producao({ podeApontar }: { podeApontar: boolean }) {
  const [painel, setPainel] = useState<PainelProducao | null>(null);
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [form, setForm] = useState<"apontar" | "parada" | null>(null);

  const carregar = useCallback(async () => {
    try {
      const p = await api<PainelProducao>("/api/producao");
      setPainel(p);
      gravarCache(CACHE, p);
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    // pinta com o ultimo dado visto e atualiza por tras. Num microtask:
    // depois da hidratacao e sem setState sincrono no effect (igual ao SApp)
    const guardado = lerCache<PainelProducao>(CACHE, 12 * 3600_000);
    queueMicrotask(() => {
      if (guardado) setPainel((atual) => atual ?? guardado.dados);
      carregar();
    });
    const t = setInterval(carregar, ATUALIZA_MS);
    return () => clearInterval(t);
  }, [carregar]);

  async function enviar(body: Record<string, unknown>, ok: string) {
    setMsg(null);
    try {
      const r = await api<{ avisos?: string[] }>("/api/producao", { body });
      setMsg({ tipo: "ok", texto: [ok, ...(r.avisos ?? [])].join(" ") });
      setForm(null);
      await carregar();
      return true;
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  return (
    <Pagina>
      <Cabecalho
        titulo="Producao"
        subtitulo={painel ? `Hoje, ${painel.hoje}` : undefined}
        acoes={
          podeApontar && (
            <>
              <Botao onClick={() => setForm(form === "apontar" ? null : "apontar")}>Apontar metros</Botao>
              <Botao tipo="secundario" onClick={() => setForm(form === "parada" ? null : "parada")}>
                Registrar parada
              </Botao>
            </>
          )
        }
      />

      {msg && (
        <div className="mb-4">
          <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
        </div>
      )}

      {form === "apontar" && painel && <FormApontar painel={painel} enviar={enviar} />}
      {form === "parada" && <FormParada enviar={enviar} />}

      {!painel ? (
        <Carregando />
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            {painel.maquinas.map((m) => (
              <Card key={m.maquina}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-500">{MAQUINA_LABEL[m.maquina]}</p>
                    <p className="text-2xl font-bold tabular-nums">{metrosFmt(m.metrosHoje)}</p>
                    <p className="text-xs text-gray-500">impressos hoje</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Ultimo flush:{" "}
                      {m.ultimoFlush
                        ? `${m.ultimoFlush.dataHora.slice(0, 5)} (${ROTINA_LABEL[m.ultimoFlush.tipo as TipoRotina]?.replace("Flush - ", "") ?? "sem motivo"}${m.ultimoFlush.dias > 0 ? `, ha ${m.ultimoFlush.dias} d` : ", hoje"})`
                        : "nenhum registrado"}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    {m.horasParadasHoje > 0 && (
                      <div>
                        <Etiqueta cor="vermelho">{m.horasParadasHoje} h parada</Etiqueta>
                      </div>
                    )}
                    {m.diasSemRodar !== null && m.diasSemRodar >= 6 && (
                      <div>
                        <Etiqueta cor="vermelho">{m.diasSemRodar} dias sem rodar</Etiqueta>
                      </div>
                    )}
                  </div>
                </div>
                {podeApontar && <AcoesMaquina maquina={m.maquina} enviar={enviar} />}
              </Card>
            ))}
          </div>

          <Card titulo={`Fila (${painel.fila.length})`}>
            {painel.fila.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum pedido aberto.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {painel.fila.map((p) => (
                  <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {p.id} · {p.cliente} {p.urgente && <Etiqueta cor="vermelho">urgente</Etiqueta>}{" "}
                        {p.atrasado && <Etiqueta cor="vermelho">atrasado</Etiqueta>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {STATUS_PEDIDO_LABEL[p.status]} · {p.tecido || "tecido?"} · prazo {p.prazo || "—"}
                        {p.maquina && ` · ${p.maquina}`}
                      </p>
                    </div>
                    <p className="text-sm tabular-nums text-right shrink-0">
                      {metrosFmt(p.metrosImpressos)}
                      <span className="text-gray-500"> / {metrosFmt(p.metros)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Ultimos apontamentos">
            {painel.ultimosApontamentos.length === 0 ? (
              <p className="text-sm text-gray-500">Nada apontado ainda.</p>
            ) : (
              <ul className="text-sm space-y-1.5">
                {painel.ultimosApontamentos.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {a.dataHora} · {a.pedidoId} · {a.maquina} · {a.etapa}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {metrosFmt(a.metros)}
                      {a.perda > 0 && <span className="text-rose-600"> (-{metrosFmt(a.perda)})</span>}
                    </span>
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

type Enviar = (body: Record<string, unknown>, ok: string) => Promise<boolean>;

/**
 * Flush nao e diario: so na troca de tinta ou quando a cabeca entope. O botao
 * abre a escolha do motivo, que vai para o painel do mes (entupimento
 * frequente = cabeca com problema).
 */
function AcoesMaquina({ maquina, enviar }: { maquina: Maquina; enviar: Enviar }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const flush = (rotina: TipoRotina) =>
    enviar({ tipo: "rotina", maquina, rotina }, `${ROTINA_LABEL[rotina]} na ${maquina} registrado.`).then((ok) => {
      if (ok) setEscolhendo(false);
    });

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {escolhendo ? (
        <>
          <Botao tipo="secundario" onClick={() => flush("flush_tinta")}>
            Troca de tinta
          </Botao>
          <Botao tipo="secundario" onClick={() => flush("flush_entupimento")}>
            Entupimento
          </Botao>
          <Botao tipo="secundario" onClick={() => setEscolhendo(false)}>
            Cancelar
          </Botao>
        </>
      ) : (
        <Botao tipo="secundario" onClick={() => setEscolhendo(true)}>
          Registrar flush
        </Botao>
      )}
      {maquina === "R2" && !escolhendo && (
        <Botao
          tipo="secundario"
          onClick={() => enviar({ tipo: "rotina", maquina: "R2", rotina: "rodada_semanal" }, "Rodada semanal da R2 registrada.")}
        >
          Rodada semanal
        </Botao>
      )}
    </div>
  );
}

function FormApontar({ painel, enviar }: { painel: PainelProducao; enviar: Enviar }) {
  const [pedidoId, setPedidoId] = useState(painel.fila[0]?.id ?? "");
  const [maquina, setMaquina] = useState<Maquina>("R1");
  const [etapa, setEtapa] = useState<string>("impressao");
  const [metros, setMetros] = useState("");
  const [perda, setPerda] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const m = Number(metros.replace(",", "."));
    await enviar(
      { tipo: "apontamento", pedidoId, maquina, etapa, metros: m, perda: Number(perda.replace(",", ".")) || 0, obs },
      `${metrosFmt(m)} apontados no ${pedidoId}.`,
    );
    setEnviando(false);
  }

  return (
    <Card titulo="Apontar metros" className="mb-4">
      {painel.fila.length === 0 ? (
        <p className="text-sm text-gray-500">Nao ha pedido aberto para apontar.</p>
      ) : (
        <form onSubmit={salvar} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Campo rotulo="Pedido">
            <select value={pedidoId} onChange={(e) => setPedidoId(e.target.value)} className={inputCls}>
              {painel.fila.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.cliente} ({metrosFmt(p.metrosImpressos)}/{metrosFmt(p.metros)})
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Maquina">
            <select value={maquina} onChange={(e) => setMaquina(e.target.value as Maquina)} className={inputCls}>
              {MAQUINAS.map((m) => (
                <option key={m} value={m}>
                  {MAQUINA_LABEL[m]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Etapa">
            <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={inputCls}>
              {ETAPAS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Metros bons">
            <input required inputMode="decimal" value={metros} onChange={(e) => setMetros(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Perda (m)">
            <input inputMode="decimal" value={perda} onChange={(e) => setPerda(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Observacao">
            <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
          </Campo>
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <Botao type="submit" disabled={enviando || !metros}>
              {enviando ? "Gravando..." : "Gravar apontamento"}
            </Botao>
          </div>
        </form>
      )}
    </Card>
  );
}

function FormParada({ enviar }: { enviar: Enviar }) {
  const [maquina, setMaquina] = useState<Maquina>("R1");
  const [horas, setHoras] = useState("");
  const [causa, setCausa] = useState<string>("cabeca");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    await enviar(
      { tipo: "parada", maquina, horas: Number(horas.replace(",", ".")), causa, descricao },
      `Parada da ${maquina} registrada.`,
    );
    setEnviando(false);
  }

  return (
    <Card titulo="Registrar parada (toda parada conta, desde o primeiro dia)" className="mb-4">
      <form onSubmit={salvar} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Campo rotulo="Maquina">
          <select value={maquina} onChange={(e) => setMaquina(e.target.value as Maquina)} className={inputCls}>
            {MAQUINAS.map((m) => (
              <option key={m} value={m}>
                {MAQUINA_LABEL[m]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Horas paradas (hoje)">
          <input required inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Causa">
          <select value={causa} onChange={(e) => setCausa(e.target.value)} className={inputCls}>
            {CAUSAS_PARADA.map((c) => (
              <option key={c} value={c}>
                {CAUSA_LABEL[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="O que aconteceu">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} />
        </Campo>
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
          <Botao type="submit" disabled={enviando || !horas}>
            {enviando ? "Gravando..." : "Gravar parada"}
          </Botao>
        </div>
      </form>
    </Card>
  );
}
