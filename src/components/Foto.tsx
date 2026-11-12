"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Cliente, Pedido } from "@/lib/comercial";
import type { ItemEstoque } from "@/lib/estoque";
import type { Lancamento } from "@/lib/financeiro";
import type { TipoFoto } from "@/lib/leitura-foto";
import type { Capability } from "@/lib/roles";
import { brl, CATEGORIAS_GASTO, SERVICOS, TECIDOS } from "@/lib/config";
import { api } from "@/lib/cliente-api";
import { ClienteNovo } from "./ClienteNovo";
import { Aviso, Botao, Campo, Card, inputCls, Pagina } from "./ui";

/**
 * Lancar por foto (celular): escolhe o tipo -> fotografa -> a IA le -> a
 * pessoa confere o formulario preenchido -> grava pelas APIs normais.
 * Nada e gravado sem o "Gravar" da pessoa.
 */

type Campos = Record<string, unknown>;

const OPCOES: { tipo: TipoFoto; icone: string; titulo: string; sub: string; cap: Capability }[] = [
  { tipo: "gasto", icone: "🧾", titulo: "Nota ou boleto", sub: "conta a pagar, cupom, recibo", cap: "write_financial" },
  { tipo: "pedido", icone: "📦", titulo: "Pedido de cliente", sub: "papel, print do WhatsApp, PDF", cap: "write_pedidos" },
  { tipo: "recebimento", icone: "💸", titulo: "Comprovante de pagamento", sub: "PIX ou transferencia recebida", cap: "write_financial" },
  { tipo: "tecido_cliente", icone: "🧵", titulo: "Tecido do cliente chegou", sub: "NF de remessa ou romaneio", cap: "write_estoque" },
  { tipo: "cliente", icone: "🪪", titulo: "Cliente novo", sub: "cartao de visita ou cartao CNPJ", cap: "write_pedidos" },
];

// ── utilidades ─────────────────────────────────────────────────────────────

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const num = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
const numTxt = (v: number) => (v ? String(v).replace(".", ",") : "");
/** "DD/MM/AAAA" -> "AAAA-MM-DD" (input date) */
const brParaIso = (v: unknown) => {
  const m = s(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
/** "AAAA-MM-DD" -> "DD/MM/AAAA" */
const isoParaBr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const normal = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(ltda|me|epp|eireli|sa|s\/a|comercio|industria|de|da|do|e)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const digitos = (t: string) => t.replace(/\D/g, "");

/** Nota de 0 a 1 de quanto dois nomes se parecem (palavras em comum). */
function parecido(a: string, b: string): number {
  const pa = new Set(normal(a).split(" ").filter((w) => w.length > 2));
  const pb = new Set(normal(b).split(" ").filter((w) => w.length > 2));
  if (!pa.size || !pb.size) return 0;
  let comum = 0;
  for (const w of pa) if (pb.has(w)) comum++;
  return comum / Math.min(pa.size, pb.size);
}

function acharCliente(clientes: Cliente[], nome: string, doc: string): Cliente | undefined {
  const d = digitos(doc);
  if (d.length >= 11) {
    const porDoc = clientes.find((c) => digitos(c.documento) === d);
    if (porDoc) return porDoc;
  }
  let melhor: Cliente | undefined;
  let nota = 0;
  for (const c of clientes) {
    const p = parecido(c.nome, nome);
    if (p > nota) {
      nota = p;
      melhor = c;
    }
  }
  return nota >= 0.6 ? melhor : undefined;
}

/**
 * Prepara o arquivo para mandar: foto reduzida para ~1800 px em JPEG (fica com
 * poucas centenas de KB, cabe no limite da Vercel e le melhor); PDF vai como
 * esta, ate ~3 MB.
 */
async function prepararArquivo(file: File): Promise<{ base64: string; mediaType: string; previa: string | null }> {
  if (file.type === "application/pdf") {
    if (file.size > 3_300_000) throw new Error("PDF grande demais (max. 3 MB).");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), mediaType: "application/pdf", previa: null };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Nao consegui abrir a imagem. Tente outra foto."));
      i.src = url;
    });
    const MAX = 1800;
    const escala = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: dataUrl.split(",")[1] ?? "", mediaType: "image/jpeg", previa: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── tela ───────────────────────────────────────────────────────────────────

export function Foto({ caps }: { caps: Capability[] }) {
  const opcoes = OPCOES.filter((o) => caps.includes(o.cap));
  const [tipo, setTipo] = useState<TipoFoto | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [campos, setCampos] = useState<Campos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function recomecar() {
    setTipo(null);
    setPrevia(null);
    setCampos(null);
    setErro(null);
    setLendo(false);
  }

  function escolher(t: TipoFoto) {
    setTipo(t);
    setFeito(null);
    setErro(null);
    setCampos(null);
    setPrevia(null);
    // abre a camera/galeria no mesmo toque (o navegador exige gesto do usuario)
    inputRef.current?.click();
  }

  async function arquivoEscolhido(file: File | undefined) {
    if (!file || !tipo) return;
    setErro(null);
    setLendo(true);
    try {
      const a = await prepararArquivo(file);
      setPrevia(a.previa);
      const r = await api<{ campos: Campos }>("/api/foto", {
        body: { tipo, arquivo: a.base64, mediaType: a.mediaType },
      });
      setCampos(r.campos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const opcao = OPCOES.find((o) => o.tipo === tipo);
  const duvidas = Array.isArray(campos?.duvidas) ? (campos!.duvidas as string[]) : [];

  return (
    <Pagina>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => arquivoEscolhido(e.target.files?.[0])}
      />

      {feito && (
        <div className="mb-4">
          <Aviso tipo="ok">{feito}</Aviso>
        </div>
      )}

      {!tipo ? (
        <>
          <h1 className="text-2xl font-bold mb-1">Lancar por foto</h1>
          <p className="text-sm text-gray-500 mb-5">Escolha o que vai fotografar. Voce confere tudo antes de gravar.</p>
          {opcoes.length === 0 ? (
            <Aviso tipo="info">Seu perfil nao lanca nada por foto.</Aviso>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {opcoes.map((o) => (
                <button
                  key={o.tipo}
                  onClick={() => escolher(o.tipo)}
                  className="flex items-center gap-4 text-left p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 active:scale-[0.98] hover:border-teal-500 transition"
                >
                  <span className="text-4xl">{o.icone}</span>
                  <span>
                    <span className="block font-semibold">{o.titulo}</span>
                    <span className="block text-xs text-gray-500">{o.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold">
              {opcao?.icone} {opcao?.titulo}
            </h1>
            <Botao tipo="secundario" onClick={recomecar}>
              Voltar
            </Botao>
          </div>

          {previa && (
            // previa local (data URL) - next/image nao se aplica
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa} alt="Foto enviada" className="max-h-56 rounded-xl border border-gray-200 dark:border-gray-800" />
          )}

          {lendo && <Aviso tipo="info">Lendo o documento... (alguns segundos)</Aviso>}
          {erro && (
            <Aviso tipo="erro">
              {erro}{" "}
              <button className="underline" onClick={() => inputRef.current?.click()}>
                Tentar outra foto
              </button>
            </Aviso>
          )}

          {!lendo && !campos && !erro && (
            <Botao onClick={() => inputRef.current?.click()} className="w-full py-4 text-base">
              📷 Tirar foto ou escolher arquivo
            </Botao>
          )}

          {campos && (
            <>
              {campos.legivel === false && (
                <Aviso tipo="erro">Nao parece ser esse tipo de documento, ou a foto esta ilegivel. Confira tudo.</Aviso>
              )}
              {duvidas.length > 0 && <Aviso tipo="info">Confira: {duvidas.join("; ")}.</Aviso>}
              <Formulario
                tipo={tipo}
                campos={campos}
                caps={caps}
                onFeito={(t) => {
                  setFeito(t);
                  recomecar();
                }}
              />
              <button className="text-sm underline text-gray-500" onClick={() => inputRef.current?.click()}>
                Ler outra foto
              </button>
            </>
          )}
        </div>
      )}
    </Pagina>
  );
}

function Formulario({
  tipo,
  campos,
  caps,
  onFeito,
}: {
  tipo: TipoFoto;
  campos: Campos;
  caps: Capability[];
  onFeito: (t: string) => void;
}) {
  switch (tipo) {
    case "gasto":
      return <ConfirmaGasto c={campos} podeEstoque={caps.includes("write_estoque")} onFeito={onFeito} />;
    case "pedido":
      return <ConfirmaPedido c={campos} onFeito={onFeito} />;
    case "recebimento":
      return <ConfirmaRecebimento c={campos} onFeito={onFeito} />;
    case "tecido_cliente":
      return <ConfirmaTecido c={campos} podeVerPedidos={caps.includes("view_pedidos")} onFeito={onFeito} />;
    case "cliente":
      return (
        <Card titulo="Confira o cliente">
          <ClienteNovo
            inicial={{
              nome: s(campos.nome),
              documento: s(campos.documento),
              telefone: s(campos.telefone),
              email: s(campos.email),
              cidade: s(campos.cidade),
              contato: s(campos.contato),
            }}
            onCriado={(cli) => onFeito(`Cliente ${cli.nome} cadastrado (${cli.id}).`)}
          />
        </Card>
      );
  }
}

function useGravar(onFeito: (t: string) => void) {
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function gravar(fn: () => Promise<string>) {
    setGravando(true);
    setErro(null);
    try {
      onFeito(await fn());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }
  return { gravando, erro, gravar };
}

// ── gasto (+ entrada no estoque dos itens) ─────────────────────────────────

interface ItemNota {
  descricao: string;
  quantidade: string;
  valorUnit: string;
  itemId: string;
  entrar: boolean;
}

function ConfirmaGasto({ c, podeEstoque, onFeito }: { c: Campos; podeEstoque: boolean; onFeito: (t: string) => void }) {
  const [credor, setCredor] = useState(s(c.credor));
  const [valor, setValor] = useState(numTxt(n(c.valor_total)));
  const [venc, setVenc] = useState(brParaIso(c.data_vencimento) || brParaIso(c.data_emissao) || hojeIso());
  const cat = s(c.categoria);
  const [categoria, setCategoria] = useState<string>((CATEGORIAS_GASTO as readonly string[]).includes(cat) ? cat : "outros");
  const [nf, setNf] = useState(s(c.numero_nf));
  const [descricao, setDescricao] = useState(s(c.descricao));
  const [pago, setPago] = useState(c.ja_pago === true);
  const [estoque, setEstoque] = useState<ItemEstoque[]>([]);
  const lidos = useMemo(() => (Array.isArray(c.itens) ? (c.itens as Campos[]) : []), [c.itens]);
  const [itens, setItens] = useState<ItemNota[]>(() =>
    lidos.map((i) => ({
      descricao: s(i.descricao),
      quantidade: numTxt(n(i.quantidade)),
      valorUnit: numTxt(n(i.valor_unitario)),
      itemId: "",
      entrar: false,
    })),
  );
  const { gravando, erro, gravar } = useGravar(onFeito);

  // casa os itens da nota com o cadastro do estoque (tinta, tecido, insumo)
  useEffect(() => {
    if (!podeEstoque || lidos.length === 0) return;
    api<{ itens: ItemEstoque[] }>("/api/estoque")
      .then((r) => {
        const proprios = r.itens.filter((i) => i.tipo !== "tecido_cliente");
        setEstoque(proprios);
        setItens((atual) =>
          atual.map((it) => {
            let melhor = "";
            let nota = 0;
            for (const e of proprios) {
              const p = parecido(e.nome, it.descricao);
              if (p > nota) {
                nota = p;
                melhor = e.id;
              }
            }
            return nota >= 0.5 ? { ...it, itemId: melhor, entrar: true } : it;
          }),
        );
      })
      .catch(() => setEstoque([]));
  }, [podeEstoque, lidos.length]);

  const setItem = (i: number, p: Partial<ItemNota>) => setItens(itens.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const entradas = itens.filter((i) => i.entrar && i.itemId && num(i.quantidade) > 0);

  return (
    <Card titulo="Confira a conta">
      <div className="space-y-3">
        <Campo rotulo="Credor">
          <input value={credor} onChange={(e) => setCredor(e.target.value)} className={inputCls} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)">
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Vencimento">
            <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Categoria">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
              {CATEGORIAS_GASTO.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="NF">
            <input value={nf} onChange={(e) => setNf(e.target.value)} className={inputCls} />
          </Campo>
        </div>
        <Campo rotulo="Descricao">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} />
        </Campo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Ja esta pago
        </label>

        {podeEstoque && itens.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
            <p className="text-xs text-gray-500">Itens da nota · marque os que entram no estoque</p>
            {itens.map((it, i) => (
              <div key={i} className="rounded-lg bg-gray-50 dark:bg-gray-950 p-2 space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={it.entrar} onChange={(e) => setItem(i, { entrar: e.target.checked })} />
                  <span>{it.descricao || `Item ${i + 1}`}</span>
                </label>
                {it.entrar && (
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      aria-label="Item do estoque"
                      value={it.itemId}
                      onChange={(e) => setItem(i, { itemId: e.target.value })}
                      className={`${inputCls} col-span-3`}
                    >
                      <option value="">Qual item do estoque?</option>
                      {estoque.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome} ({e.unidade})
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Quantidade"
                      inputMode="decimal"
                      placeholder="Qtd"
                      value={it.quantidade}
                      onChange={(e) => setItem(i, { quantidade: e.target.value })}
                      className={inputCls}
                    />
                    <input
                      aria-label="Valor unitario"
                      inputMode="decimal"
                      placeholder="R$ unit."
                      value={it.valorUnit}
                      onChange={(e) => setItem(i, { valorUnit: e.target.value })}
                      className={`${inputCls} col-span-2`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Botao
          className="w-full py-3"
          disabled={gravando || !credor || !num(valor)}
          onClick={() =>
            gravar(async () => {
              await api("/api/financeiro", {
                body: {
                  acao: "gasto",
                  categoria,
                  credor,
                  valor: num(valor),
                  dataVenc: isoParaBr(venc),
                  descricao,
                  nf,
                  pago,
                },
              });
              for (const it of entradas) {
                await api("/api/estoque", {
                  body: {
                    acao: "movimento",
                    itemId: it.itemId,
                    tipoMov: "entrada",
                    quantidade: num(it.quantidade),
                    custoUnit: num(it.valorUnit) || undefined,
                    fornecedor: credor,
                    nf,
                    obs: "Lancado por foto",
                  },
                });
              }
              return (
                `Conta de ${brl(num(valor))} (${credor}) lancada${pago ? " como paga" : ""}.` +
                (entradas.length ? ` ${entradas.length} item(ns) deram entrada no estoque.` : "")
              );
            })
          }
        >
          {gravando ? "Gravando..." : `Gravar conta${entradas.length ? ` + ${entradas.length} no estoque` : ""}`}
        </Botao>
      </div>
    </Card>
  );
}

// ── pedido ─────────────────────────────────────────────────────────────────

interface LinhaForm {
  desenho: string;
  tecido: string;
  metros: string;
  preco: string;
}

function ConfirmaPedido({ c, onFeito }: { c: Campos; onFeito: (t: string) => void }) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [cadastrar, setCadastrar] = useState(false);
  const [pedCli, setPedCli] = useState(s(c.numero_pedido));
  const [prazo, setPrazo] = useState(brParaIso(c.data_entrega));
  const [diasPgto, setDiasPgto] = useState(s(c.pagamento));
  const [servico, setServico] = useState(SERVICOS[0].id);
  const [obs, setObs] = useState(s(c.observacao));
  const [linhas, setLinhas] = useState<LinhaForm[]>(() => {
    const lidas = Array.isArray(c.linhas) ? (c.linhas as Campos[]) : [];
    const ls = lidas.map((l) => ({
      desenho: s(l.desenho),
      tecido: (TECIDOS as readonly string[]).includes(s(l.tecido)) ? s(l.tecido) : "tricoline",
      metros: numTxt(n(l.metros)),
      preco: numTxt(n(l.preco_m)),
    }));
    return ls.length ? ls : [{ desenho: "", tecido: "tricoline", metros: "", preco: "" }];
  });
  const { gravando, erro, gravar } = useGravar(onFeito);
  const nomeLido = s(c.cliente_nome);

  useEffect(() => {
    api<{ clientes: Cliente[] }>("/api/clientes")
      .then((r) => {
        setClientes(r.clientes);
        const achado = acharCliente(r.clientes, nomeLido, s(c.cliente_documento));
        if (achado) setClienteId(achado.id);
        else if (nomeLido) setCadastrar(true);
      })
      .catch(() => setClientes([]));
  }, [nomeLido, c.cliente_documento]);

  const setLinha = (i: number, p: Partial<LinhaForm>) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const metros = linhas.reduce((t, l) => t + num(l.metros), 0);

  return (
    <Card titulo="Confira o pedido">
      <div className="space-y-3">
        {cadastrar ? (
          <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 p-3">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-300 mb-2">
              Cliente &quot;{nomeLido}&quot; nao esta cadastrado
            </p>
            <ClienteNovo
              inicial={{ nome: nomeLido, documento: s(c.cliente_documento), telefone: s(c.cliente_telefone) }}
              onCriado={(cli) => {
                setClientes((l) => [...(l ?? []), cli]);
                setClienteId(cli.id);
                setCadastrar(false);
              }}
              onCancelar={() => setCadastrar(false)}
            />
          </div>
        ) : (
          <Campo rotulo={nomeLido ? `Cliente (lido: ${nomeLido})` : "Cliente"}>
            <div className="flex gap-2">
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={inputCls}>
                <option value="">{clientes ? "Escolha..." : "Carregando..."}</option>
                {clientes?.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.nome}
                  </option>
                ))}
              </select>
              <Botao tipo="secundario" onClick={() => setCadastrar(true)} className="shrink-0">
                + Novo
              </Botao>
            </div>
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="No do pedido">
            <input value={pedCli} onChange={(e) => setPedCli(e.target.value)} placeholder="automatico" className={inputCls} />
          </Campo>
          <Campo rotulo="Entrega">
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Pagamento">
            <input value={diasPgto} onChange={(e) => setDiasPgto(e.target.value)} placeholder="padrao do cliente" className={inputCls} />
          </Campo>
          <Campo rotulo="Servico">
            <select value={servico} onChange={(e) => setServico(e.target.value)} className={inputCls}>
              {SERVICOS.map((sv) => (
                <option key={sv.id} value={sv.id}>
                  {sv.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <p className="text-xs text-gray-500">Desenhos</p>
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 dark:bg-gray-950 p-2">
            <input
              aria-label="Desenho"
              placeholder="Desenho"
              value={l.desenho}
              onChange={(e) => setLinha(i, { desenho: e.target.value })}
              className={`${inputCls} col-span-2`}
            />
            <select aria-label="Tecido" value={l.tecido} onChange={(e) => setLinha(i, { tecido: e.target.value })} className={inputCls}>
              {TECIDOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              aria-label="Metros"
              inputMode="decimal"
              placeholder="Metros"
              value={l.metros}
              onChange={(e) => setLinha(i, { metros: e.target.value })}
              className={inputCls}
            />
            <input
              aria-label="Preco por metro"
              inputMode="decimal"
              placeholder="R$/m (vazio = tabela)"
              value={l.preco}
              onChange={(e) => setLinha(i, { preco: e.target.value })}
              className={`${inputCls} col-span-2`}
            />
            {linhas.length > 1 && (
              <button className="text-xs text-rose-600 text-left" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>
                Remover desenho
              </button>
            )}
          </div>
        ))}
        <Botao tipo="secundario" onClick={() => setLinhas([...linhas, { desenho: "", tecido: "tricoline", metros: "", preco: "" }])}>
          + Desenho
        </Botao>
        <Campo rotulo="Observacao">
          <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
        </Campo>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Botao
          className="w-full py-3"
          disabled={gravando || !clienteId || !metros || cadastrar}
          onClick={() =>
            gravar(async () => {
              const r = await api<{ pedCli: string; ids: string[]; valorLiquido: number; avisos: string[] }>("/api/pedidos", {
                body: {
                  clienteId,
                  pedCli,
                  prazo: isoParaBr(prazo),
                  diasPgto,
                  obs,
                  linhas: linhas
                    .filter((l) => num(l.metros) > 0)
                    .map((l) => ({
                      desenho: l.desenho,
                      tecido: l.tecido,
                      servico,
                      metros: num(l.metros),
                      precoM: num(l.preco) || undefined,
                    })),
                },
              });
              return `Pedido ${r.pedCli} gravado: ${r.ids.length} desenho(s), ${brl(r.valorLiquido)}.${r.avisos.length ? " " + r.avisos.join(" ") : ""}`;
            })
          }
        >
          {gravando ? "Gravando..." : `Gravar pedido (${metros.toLocaleString("pt-BR")} m)`}
        </Botao>
      </div>
    </Card>
  );
}

// ── comprovante de recebimento ─────────────────────────────────────────────

function ConfirmaRecebimento({ c, onFeito }: { c: Campos; onFeito: (t: string) => void }) {
  const [abertos, setAbertos] = useState<Lancamento[] | null>(null);
  const [escolhido, setEscolhido] = useState<string>("");
  const [valor, setValor] = useState(numTxt(n(c.valor)));
  const [data, setData] = useState(brParaIso(c.data) || hojeIso());
  const [pagador, setPagador] = useState(s(c.pagador));
  const { gravando, erro, gravar } = useGravar(onFeito);

  useEffect(() => {
    api<{ recebimentos: Lancamento[] }>("/api/financeiro")
      .then((r) => setAbertos(r.recebimentos.filter((x) => x.status === "aberto")))
      .catch(() => setAbertos([]));
  }, []);

  // candidatos: valor igual vale mais que nome parecido
  const candidatos = useMemo(() => {
    const v = num(valor);
    return (abertos ?? [])
      .map((r) => ({ r, nota: (Math.abs(r.valor - v) < 0.01 ? 2 : 0) + parecido(r.pessoa, pagador) }))
      .filter((x) => x.nota >= 0.5)
      .sort((a, b) => b.nota - a.nota)
      .slice(0, 5);
  }, [abertos, valor, pagador]);

  // sem escolha da pessoa, ja vem marcada a conta com o mesmo valor
  const selecionado = escolhido || (candidatos[0] && candidatos[0].nota >= 2 ? candidatos[0].r.id : "");

  return (
    <Card titulo="Confira o recebimento">
      <div className="space-y-3">
        <Campo rotulo="Pagador">
          <input value={pagador} onChange={(e) => setPagador(e.target.value)} className={inputCls} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)">
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Recebido em">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        <p className="text-xs text-gray-500">Qual conta este pagamento quita?</p>
        {!abertos ? (
          <p className="text-sm text-gray-500">Buscando contas em aberto...</p>
        ) : (
          <div className="space-y-2">
            {candidatos.map(({ r }) => (
              <label
                key={r.id}
                className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${selecionado === r.id ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40" : "border-gray-200 dark:border-gray-800"}`}
              >
                <input type="radio" name="conta" checked={selecionado === r.id} onChange={() => setEscolhido(r.id)} />
                <span>
                  <b>{r.pessoa}</b> · {brl(r.valor)}
                  <span className="block text-xs text-gray-500">
                    {r.categoria} {r.pedidoId && `· pedido ${r.pedidoId}`} · vence {r.dataVenc}
                  </span>
                </span>
              </label>
            ))}
            <label
              className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${selecionado === "avulso" ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40" : "border-gray-200 dark:border-gray-800"}`}
            >
              <input type="radio" name="conta" checked={selecionado === "avulso"} onChange={() => setEscolhido("avulso")} />
              <span>Nenhuma destas: lancar como recebimento avulso, ja recebido</span>
            </label>
          </div>
        )}

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Botao
          className="w-full py-3"
          disabled={gravando || !selecionado || !num(valor)}
          onClick={() =>
            gravar(async () => {
              let id = escolhido;
              if (selecionado === "avulso") {
                const r = await api<{ id: string }>("/api/financeiro", {
                  body: { acao: "recebimento", cliente: pagador, valor: num(valor), dataVenc: isoParaBr(data), obs: s(c.observacao) },
                });
                id = r.id;
              }
              await api("/api/financeiro", { body: { acao: "liquidar", tipo: "recebimento", id, data: isoParaBr(data) } });
              const conta = abertos?.find((x) => x.id === selecionado);
              const dif = conta ? num(valor) - conta.valor : 0;
              return (
                `Recebimento de ${brl(num(valor))} (${pagador}) baixado.` +
                (Math.abs(dif) >= 0.01 ? ` Atencao: a conta era ${brl(conta!.valor)} (diferenca ${brl(dif)}).` : "")
              );
            })
          }
        >
          {gravando ? "Gravando..." : "Marcar como recebido"}
        </Botao>
      </div>
    </Card>
  );
}

// ── tecido do cliente chegou ───────────────────────────────────────────────

function ConfirmaTecido({
  c,
  podeVerPedidos,
  onFeito,
}: {
  c: Campos;
  podeVerPedidos: boolean;
  onFeito: (t: string) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [semItem, setSemItem] = useState(false);
  const [aguardando, setAguardando] = useState<Pedido[]>([]);
  const [pedido, setPedido] = useState(s(c.numero_pedido));
  const [metros, setMetros] = useState(numTxt(n(c.metros)));
  const nf = s(c.nf_remessa);
  const descricao = s(c.descricao);
  const { gravando, erro, gravar } = useGravar(onFeito);

  useEffect(() => {
    api<{ itens: ItemEstoque[] }>("/api/estoque")
      .then((r) => {
        const it = r.itens.find((i) => i.tipo === "tecido_cliente");
        if (it) setItemId(it.id);
        else setSemItem(true);
      })
      .catch(() => setSemItem(true));
    if (!podeVerPedidos) return;
    api<{ pedidos: Pedido[] }>("/api/pedidos?status=aguardando_tecido")
      .then((r) => {
        setAguardando(r.pedidos);
        // sem numero lido: sugere o pedido do mesmo cliente que espera tecido
        const nome = s(c.cliente_nome);
        if (!s(c.numero_pedido) && nome) {
          const p = r.pedidos.find((x) => parecido(x.cliente, nome) >= 0.6);
          if (p) setPedido(p.pedCli);
        }
      })
      .catch(() => setAguardando([]));
  }, [podeVerPedidos, c.cliente_nome, c.numero_pedido]);

  const grupos = [...new Map(aguardando.map((p) => [p.pedCli, p])).values()];

  return (
    <Card titulo="Confira a chegada do tecido">
      <div className="space-y-3">
        {semItem && <Aviso tipo="erro">Cadastre no Estoque um item do tipo &quot;Tecido do cliente&quot; antes.</Aviso>}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {s(c.cliente_nome) || "Cliente nao identificado"}
          {descricao && ` · ${descricao}`}
          {nf && ` · NF ${nf}`}
        </p>
        <Campo rotulo="Metros recebidos">
          <input inputMode="decimal" value={metros} onChange={(e) => setMetros(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Pedido (libera para a fila)">
          {grupos.length > 0 ? (
            <select value={pedido} onChange={(e) => setPedido(e.target.value)} className={inputCls}>
              <option value="">Sem pedido</option>
              {grupos.map((p) => (
                <option key={p.pedCli} value={p.pedCli}>
                  {p.pedCli} · {p.cliente}
                </option>
              ))}
              {pedido && !grupos.some((g) => g.pedCli === pedido) && <option value={pedido}>{pedido} (lido na foto)</option>}
            </select>
          ) : (
            <input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="no do pedido" className={inputCls} />
          )}
        </Campo>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Botao
          className="w-full py-3"
          disabled={gravando || !itemId || !num(metros)}
          onClick={() =>
            gravar(async () => {
              const r = await api<{ pedidosLiberados: string[]; avisos: string[] }>("/api/estoque", {
                body: {
                  acao: "movimento",
                  itemId,
                  tipoMov: "entrada",
                  quantidade: num(metros),
                  pedido,
                  nf,
                  obs: [s(c.cliente_nome), descricao, "lancado por foto"].filter(Boolean).join(" · "),
                },
              });
              return (
                `Entrada de ${num(metros).toLocaleString("pt-BR")} m de tecido do cliente registrada.` +
                (r.pedidosLiberados.length ? ` Liberado para a fila: ${r.pedidosLiberados.join(", ")}.` : "") +
                (r.avisos.length ? ` ${r.avisos.join(" ")}` : "")
              );
            })
          }
        >
          {gravando ? "Gravando..." : "Gravar chegada do tecido"}
        </Botao>
      </div>
    </Card>
  );
}
