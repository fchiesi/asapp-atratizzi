"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ItemEstoque, Movimento, ResultadoMovimento } from "@/lib/estoque";
import {
  brl,
  MAQUINA_LABEL,
  MAQUINAS,
  TIPO_ITEM_LABEL,
  TIPOS_ITEM,
  UNIDADES_ESTOQUE,
  type TipoItem,
  type TipoMov,
} from "@/lib/config";
import { api } from "@/lib/cliente-api";
import { Aviso, Botao, Cabecalho, Campo, Card, Carregando, Etiqueta, inputCls, Numero, Pagina } from "./ui";

interface Dados {
  itens: ItemEstoque[];
  movimentos: Movimento[];
}

const qtd = (v: number, u: string) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${u}`;
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const dataBR = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

/**
 * Estoque de tintas, tecidos e insumos: saldo (soma dos movimentos), alerta de
 * minimo, entrada/saida/ajuste de inventario e cadastro de item.
 */
export function Estoque({ podeMovimentar, podeLancarConta }: { podeMovimentar: boolean; podeLancarConta: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [form, setForm] = useState<"movimento" | "item" | null>(null);
  const [aba, setAba] = useState<TipoItem | "todos">("todos");

  const carregar = useCallback(async () => {
    try {
      setDados(await api<Dados>("/api/estoque"));
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(carregar);
  }, [carregar]);

  const itens = useMemo(
    () => (dados?.itens ?? []).filter((i) => aba === "todos" || i.tipo === aba),
    [dados, aba],
  );
  const abaixo = (dados?.itens ?? []).filter((i) => i.abaixoMinimo);
  const valorEstoque = (dados?.itens ?? []).reduce((s, i) => s + i.valorSaldo, 0);
  const tecidoCliente = (dados?.itens ?? [])
    .filter((i) => i.tipo === "tecido_cliente")
    .reduce((s, i) => s + Math.max(i.saldo, 0), 0);

  return (
    <Pagina>
      <Cabecalho
        titulo="Estoque"
        subtitulo="Tintas, tecidos e insumos · saldo = soma das entradas, saidas e ajustes"
        acoes={
          podeMovimentar && (
            <>
              <Botao onClick={() => setForm(form === "movimento" ? null : "movimento")}>Entrada / saida</Botao>
              <Botao tipo="secundario" onClick={() => setForm(form === "item" ? null : "item")}>
                Novo item
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

      {form === "movimento" && dados && (
        <FormMovimento
          itens={dados.itens}
          podeLancarConta={podeLancarConta}
          onFeito={(t) => {
            setMsg({ tipo: "ok", texto: t });
            setForm(null);
            carregar();
          }}
          onErro={(t) => setMsg({ tipo: "erro", texto: t })}
        />
      )}
      {form === "item" && (
        <FormItem
          onFeito={(t) => {
            setMsg({ tipo: "ok", texto: t });
            setForm(null);
            carregar();
          }}
          onErro={(t) => setMsg({ tipo: "erro", texto: t })}
        />
      )}

      {!dados ? (
        <Carregando />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Numero
              rotulo="Abaixo do minimo"
              valor={abaixo.length}
              detalhe={abaixo.map((i) => i.nome).join(", ") || "tudo acima do minimo"}
              tom={abaixo.length ? "alerta" : "ok"}
            />
            <Numero rotulo="Valor do estoque (proprio)" valor={brl(valorEstoque)} detalhe="saldo × custo do cadastro" />
            <Numero rotulo="Tecido de cliente em casa" valor={qtd(tecidoCliente, "m")} />
          </div>

          <Card
            titulo={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Saldos</span>
                <select
                  value={aba}
                  onChange={(e) => setAba(e.target.value as TipoItem | "todos")}
                  className={`${inputCls} w-auto py-1`}
                >
                  <option value="todos">Todos</option>
                  {TIPOS_ITEM.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_ITEM_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            {itens.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum item cadastrado neste filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500">
                    <tr>
                      <th className="text-left font-normal pb-2">Item</th>
                      <th className="text-right font-normal pb-2">Saldo</th>
                      <th className="text-right font-normal pb-2">Minimo</th>
                      <th className="text-right font-normal pb-2 hidden sm:table-cell">Custo</th>
                      <th className="text-right font-normal pb-2 hidden sm:table-cell">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-2">
                          <p className="font-medium">
                            {i.nome} {i.abaixoMinimo && <Etiqueta cor="vermelho">abaixo do minimo</Etiqueta>}
                          </p>
                          <p className="text-xs text-gray-500">
                            {TIPO_ITEM_LABEL[i.tipo]}
                            {i.cor && ` · ${i.cor}`}
                            {i.larguraM > 0 && ` · ${i.larguraM} m larg.`}
                            {i.fornecedor && ` · ${i.fornecedor}`}
                          </p>
                        </td>
                        <td
                          className={`text-right tabular-nums ${i.saldo < 0 ? "text-rose-600" : i.abaixoMinimo ? "text-amber-600" : ""}`}
                        >
                          {qtd(i.saldo, i.unidade)}
                        </td>
                        <td className="text-right tabular-nums text-gray-500">{i.minimo ? qtd(i.minimo, i.unidade) : "—"}</td>
                        <td className="text-right tabular-nums text-gray-500 hidden sm:table-cell">
                          {i.tipo === "tecido_cliente" ? "—" : i.custoUnit ? `${brl(i.custoUnit)}/${i.unidade}` : "—"}
                        </td>
                        <td className="text-right tabular-nums hidden sm:table-cell">
                          {i.tipo === "tecido_cliente" ? "—" : brl(i.valorSaldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card titulo="Ultimos movimentos">
            {dados.movimentos.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum movimento ainda.</p>
            ) : (
              <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                {dados.movimentos.map((m) => (
                  <li key={m.id} className="py-2 flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate">
                        <Etiqueta cor={m.tipoMov === "entrada" ? "verde" : m.tipoMov === "saida" ? "azul" : "amarelo"}>
                          {m.tipoMov}
                        </Etiqueta>{" "}
                        {m.item}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {m.dataHora}
                        {m.maquina && ` · ${m.maquina}`}
                        {m.pedido && ` · pedido ${m.pedido}`}
                        {m.fornecedor && ` · ${m.fornecedor}`}
                        {m.nf && ` · NF ${m.nf}`}
                        {m.lote && ` · lote ${m.lote}`}
                        {` · ${m.operador}`}
                      </p>
                    </div>
                    <span className={`tabular-nums shrink-0 ${m.tipoMov === "saida" || m.quantidade < 0 ? "text-rose-600" : ""}`}>
                      {m.tipoMov === "saida" ? "-" : m.quantidade > 0 && m.tipoMov === "ajuste" ? "+" : ""}
                      {m.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
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

function FormMovimento({
  itens,
  podeLancarConta,
  onFeito,
  onErro,
}: {
  itens: ItemEstoque[];
  podeLancarConta: boolean;
  onFeito: (t: string) => void;
  onErro: (t: string) => void;
}) {
  const [itemId, setItemId] = useState(itens[0]?.id ?? "");
  const [tipoMov, setTipoMov] = useState<TipoMov>("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [custo, setCusto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [nf, setNf] = useState("");
  const [lote, setLote] = useState("");
  const [pedido, setPedido] = useState("");
  const [maquina, setMaquina] = useState("");
  const [obs, setObs] = useState("");
  const [lancarConta, setLancarConta] = useState(false);
  const [venc, setVenc] = useState("");
  const [salvando, setSalvando] = useState(false);

  const item = itens.find((i) => i.id === itemId);
  const deCliente = item?.tipo === "tecido_cliente";
  const valor = num(quantidade) * (num(custo) || item?.custoUnit || 0);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api<ResultadoMovimento>("/api/estoque", {
        body: {
          acao: "movimento",
          itemId,
          tipoMov,
          quantidade: num(quantidade),
          custoUnit: num(custo) || undefined,
          fornecedor,
          nf,
          lote,
          pedido,
          maquina,
          obs,
          vencimentoGasto: lancarConta ? dataBR(venc) : undefined,
        },
      });
      const partes = [`${tipoMov === "ajuste" ? "Ajuste" : tipoMov === "entrada" ? "Entrada" : "Saida"} registrada: ${item?.nome} fica com ${qtd(r.saldo, item?.unidade ?? "")}.`];
      if (r.gastoId) partes.push("Conta a pagar lancada no financeiro.");
      if (r.pedidosLiberados.length) partes.push(`Liberado para a fila: ${r.pedidosLiberados.join(", ")}.`);
      onFeito([...partes, ...r.avisos].join(" "));
    } catch (err) {
      onErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  if (itens.length === 0) {
    return (
      <Card className="mb-4">
        <p className="text-sm text-gray-500">Cadastre um item antes (botao Novo item).</p>
      </Card>
    );
  }

  return (
    <Card titulo="Movimento de estoque" className="mb-4">
      <form onSubmit={salvar} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Campo rotulo="Item">
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
            {TIPOS_ITEM.map((t) => {
              const grupo = itens.filter((i) => i.tipo === t);
              return grupo.length ? (
                <optgroup key={t} label={TIPO_ITEM_LABEL[t]}>
                  {grupo.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome} ({qtd(i.saldo, i.unidade)})
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </Campo>
        <Campo rotulo="Movimento">
          <select value={tipoMov} onChange={(e) => setTipoMov(e.target.value as TipoMov)} className={inputCls}>
            <option value="entrada">Entrada (compra / recebimento)</option>
            <option value="saida">Saida (consumo / uso no pedido)</option>
            <option value="ajuste">Ajuste de inventario</option>
          </select>
        </Campo>
        <Campo rotulo={tipoMov === "ajuste" ? `Saldo contado (${item?.unidade})` : `Quantidade (${item?.unidade})`}>
          <input
            required
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className={inputCls}
          />
        </Campo>
        {tipoMov === "ajuste" && item && (
          <p className="text-xs text-gray-500 self-end pb-2">
            Sistema mostra {qtd(item.saldo, item.unidade)}; a diferenca vira o ajuste.
          </p>
        )}

        {tipoMov === "entrada" && !deCliente && (
          <>
            <Campo rotulo={`Custo por ${item?.unidade} (R$)`}>
              <input
                inputMode="decimal"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                placeholder={item?.custoUnit ? String(item.custoUnit).replace(".", ",") : ""}
                className={inputCls}
              />
            </Campo>
            <Campo rotulo="Fornecedor">
              <input
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder={item?.fornecedor}
                className={inputCls}
              />
            </Campo>
            <Campo rotulo="NF">
              <input value={nf} onChange={(e) => setNf(e.target.value)} className={inputCls} />
            </Campo>
            <Campo rotulo="Lote">
              <input value={lote} onChange={(e) => setLote(e.target.value)} className={inputCls} />
            </Campo>
          </>
        )}

        {(deCliente || tipoMov === "saida") && (
          <Campo rotulo={deCliente && tipoMov === "entrada" ? "Pedido (libera para a fila)" : "Pedido"}>
            <input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="P-0001 ou no do pedido" className={inputCls} />
          </Campo>
        )}
        {tipoMov === "saida" && item?.tipo === "tinta" && (
          <Campo rotulo="Maquina">
            <select value={maquina} onChange={(e) => setMaquina(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {MAQUINAS.map((m) => (
                <option key={m} value={m}>
                  {MAQUINA_LABEL[m]}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Observacao">
          <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
        </Campo>

        {tipoMov === "entrada" && !deCliente && podeLancarConta && (
          <div className="sm:col-span-2 flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" checked={lancarConta} onChange={(e) => setLancarConta(e.target.checked)} />
              Lancar conta a pagar ({brl(valor)})
            </label>
            {lancarConta && (
              <Campo rotulo="Vencimento">
                <input required type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputCls} />
              </Campo>
            )}
          </div>
        )}

        <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
          <Botao type="submit" disabled={salvando || !quantidade}>
            {salvando ? "Gravando..." : "Gravar"}
          </Botao>
        </div>
      </form>
    </Card>
  );
}

function FormItem({ onFeito, onErro }: { onFeito: (t: string) => void; onErro: (t: string) => void }) {
  const [tipo, setTipo] = useState<TipoItem>("tinta");
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("");
  const [unidade, setUnidade] = useState("L");
  const [largura, setLargura] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [minimo, setMinimo] = useState("");
  const [custo, setCusto] = useState("");
  const [salvando, setSalvando] = useState(false);

  function trocarTipo(t: TipoItem) {
    setTipo(t);
    setUnidade(t === "tinta" ? "L" : t === "insumo" ? "un" : "m");
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api<{ id: string }>("/api/estoque", {
        body: {
          acao: "item",
          tipo,
          nome,
          cor,
          unidade,
          larguraM: num(largura),
          fornecedor,
          minimo: num(minimo),
          custoUnit: num(custo),
        },
      });
      onFeito(`Item ${nome} cadastrado (${r.id}). Saldo comeca em zero: de a entrada ou um ajuste.`);
    } catch (err) {
      onErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card titulo="Novo item de estoque" className="mb-4">
      <form onSubmit={salvar} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Campo rotulo="Tipo">
          <select value={tipo} onChange={(e) => trocarTipo(e.target.value as TipoItem)} className={inputCls}>
            {TIPOS_ITEM.map((t) => (
              <option key={t} value={t}>
                {TIPO_ITEM_LABEL[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Nome">
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={tipo === "tinta" ? "Pigmento Ciano" : tipo === "tecido" ? "Tricoline 1,50 m branco" : ""}
            className={inputCls}
          />
        </Campo>
        <Campo rotulo={tipo === "tinta" ? "Cor" : "Cor / acabamento"}>
          <input value={cor} onChange={(e) => setCor(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Unidade">
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className={inputCls}>
            {UNIDADES_ESTOQUE.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Campo>
        {(tipo === "tecido" || tipo === "tecido_cliente") && (
          <Campo rotulo="Largura (m)">
            <input inputMode="decimal" value={largura} onChange={(e) => setLargura(e.target.value)} className={inputCls} />
          </Campo>
        )}
        <Campo rotulo="Fornecedor">
          <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo={`Estoque minimo (${unidade})`}>
          <input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} className={inputCls} />
        </Campo>
        {tipo !== "tecido_cliente" && (
          <Campo rotulo={`Custo por ${unidade} (R$)`}>
            <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} className={inputCls} />
          </Campo>
        )}
        <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
          <Botao type="submit" disabled={salvando || !nome}>
            {salvando ? "Salvando..." : "Cadastrar item"}
          </Botao>
        </div>
      </form>
    </Card>
  );
}
