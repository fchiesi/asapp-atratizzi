"use client";

import { useCallback, useEffect, useState } from "react";
import type { Indicador, Indicadores } from "@/lib/metas";
import { brl, CAUSA_LABEL, MAQUINA_LABEL, metrosFmt, type Maquina } from "@/lib/config";
import { api, deslocarMes, nomeMes } from "@/lib/cliente-api";
import { Aviso, Botao, Cabecalho, Card, Carregando, Numero, Pagina } from "./ui";

function formatar(i: Indicador): string {
  if (i.valor === null) return "—";
  switch (i.formato) {
    case "brl":
      return brl(i.valor);
    case "metros":
      return metrosFmt(i.valor);
    case "pct":
      return `${(i.valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "dias":
      return `${i.valor} ${i.valor === 1 ? "dia" : "dias"}`;
    default:
      return i.valor.toLocaleString("pt-BR");
  }
}

const TOM = { ok: "ok", alerta: "alerta", atencao: "atencao", sem_dado: "neutro", neutro: "neutro" } as const;

/**
 * Painel de metas + relatorio mensal (Proposta v6, pagina 6).
 * "Imprimir relatorio" usa o print do navegador (salvar como PDF).
 */
export function PainelMetas({ mesInicial }: { mesInicial: string }) {
  const [mes, setMes] = useState(mesInicial);
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (m: string) => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await api<Indicadores>(`/api/metas?mes=${m}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => carregar(mes));
  }, [mes, carregar]);

  const metros = dados?.indicadores.find((i) => i.chave === "metros");
  const progresso = dados && metros?.valor != null && dados.meta.metros ? metros.valor / dados.meta.metros : 0;

  return (
    <Pagina>
      <Cabecalho
        titulo="Painel de metas"
        subtitulo={
          dados?.mesDaOperacao
            ? `${nomeMes(mes)} · mes ${dados.mesDaOperacao} da operacao`
            : `${nomeMes(mes)} · antes do inicio da operacao`
        }
        acoes={
          <div className="flex gap-2 print:hidden">
            <Botao tipo="secundario" onClick={() => setMes(deslocarMes(mes, -1))}>
              ← Mes anterior
            </Botao>
            <Botao tipo="secundario" onClick={() => setMes(deslocarMes(mes, 1))}>
              Proximo →
            </Botao>
            <Botao onClick={() => window.print()}>Imprimir relatorio</Botao>
          </div>
        }
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && !dados && <Carregando />}

      {dados && (
        <div className={`space-y-6 ${carregando ? "opacity-60" : ""}`}>
          <Card titulo="Metros faturados contra a meta">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-3xl font-bold tabular-nums">{metrosFmt(metros?.valor ?? 0)}</p>
              <p className="text-sm text-gray-500">
                meta {metrosFmt(dados.meta.metros)} · empate em {metrosFmt(dados.pontoEquilibrioMetros)}
                {dados.meta.origem === "padrao" && " · meta padrao do plano"}
              </p>
            </div>
            <div className="mt-3 h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
              <div
                className={`h-full ${progresso >= 1 ? "bg-emerald-500" : progresso >= 0.7 ? "bg-teal-600" : "bg-rose-500"}`}
                style={{ width: `${Math.min(progresso, 1) * 100}%` }}
              />
              {dados.meta.metros > 0 && dados.pontoEquilibrioMetros < dados.meta.metros && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-900 dark:bg-white"
                  style={{ left: `${(dados.pontoEquilibrioMetros / dados.meta.metros) * 100}%` }}
                  title="Ponto de equilibrio"
                />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Custo fixo do mes {brl(dados.meta.custoFixo)}; a linha marca os metros para empatar.
            </p>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {dados.indicadores
              .filter((i) => i.chave !== "metros")
              .map((i) => (
                <Numero key={i.chave} rotulo={i.nome} valor={formatar(i)} detalhe={`meta: ${i.meta}`} tom={TOM[i.situacao]} />
              ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card titulo="Financeiro do mes">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-gray-500">Faturamento (entregues)</dt>
                <dd className="text-right tabular-nums">{brl(dados.financeiro.faturamento)}</dd>
                <dt className="text-gray-500">Recebido</dt>
                <dd className="text-right tabular-nums">{brl(dados.financeiro.recebido)}</dd>
                <dt className="text-gray-500">Pago</dt>
                <dd className="text-right tabular-nums">{brl(dados.financeiro.pago)}</dd>
                <dt className="font-medium">Resultado de caixa</dt>
                <dd
                  className={`text-right tabular-nums font-semibold ${dados.financeiro.resultadoCaixa < 0 ? "text-rose-600" : "text-emerald-600"}`}
                >
                  {brl(dados.financeiro.resultadoCaixa)}
                </dd>
                <dt className="text-gray-500 pt-2">A receber (aberto)</dt>
                <dd className="text-right tabular-nums pt-2">{brl(dados.financeiro.aReceber)}</dd>
                <dt className="text-gray-500">A pagar (aberto)</dt>
                <dd className="text-right tabular-nums">{brl(dados.financeiro.aPagar)}</dd>
                <dt className="text-gray-500">Inadimplente</dt>
                <dd className="text-right tabular-nums">{brl(dados.financeiro.inadimplente)}</dd>
              </dl>
            </Card>

            <Card titulo="Maquinas no mes">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left font-normal pb-2">Maquina</th>
                    <th className="text-right font-normal pb-2">Impresso</th>
                    <th className="text-right font-normal pb-2">Dias parada</th>
                    <th className="text-right font-normal pb-2">Horas</th>
                    <th className="text-right font-normal pb-2" title="Flushes no mes (por entupimento)">
                      Flush (entup.)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.producao.map((p) => (
                    <tr key={p.maquina} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2">{MAQUINA_LABEL[p.maquina as Maquina] ?? p.maquina}</td>
                      <td className="text-right tabular-nums">{metrosFmt(p.metrosImpressos)}</td>
                      <td className="text-right tabular-nums">{p.diasParados}</td>
                      <td className="text-right tabular-nums">{p.horasParadas.toLocaleString("pt-BR")}</td>
                      <td className="text-right tabular-nums">
                        {p.flushes}
                        {p.flushes > 0 && <span className="text-gray-500"> ({p.flushesEntupimento})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dados.paradasPorCausa.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 mb-1">Horas paradas por causa</p>
                  <ul className="text-sm space-y-1">
                    {dados.paradasPorCausa.map((c) => (
                      <li key={c.causa} className="flex justify-between">
                        <span>{CAUSA_LABEL[c.causa as keyof typeof CAUSA_LABEL] ?? c.causa}</span>
                        <span className="tabular-nums">{c.horas.toLocaleString("pt-BR")} h</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <p className="text-xs text-gray-500">
            Metas e limites de alerta da Proposta Operacional v6. Meta do mes vem da aba METAS da planilha; sem linha
            para o mes, usa o plano comercial padrao.
          </p>
        </div>
      )}
    </Pagina>
  );
}
