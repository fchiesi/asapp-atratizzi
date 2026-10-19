"use client";

import { useState } from "react";
import type { Cliente } from "@/lib/comercial";
import { CONDICAO_LABEL, type Condicao } from "@/lib/config";
import { api } from "@/lib/cliente-api";
import { Aviso, Botao, Campo, inputCls } from "./ui";

const VAZIO = { nome: "", telefone: "", condicao: "novo" as Condicao, documento: "", cidade: "Blumenau", contato: "", email: "", obs: "" };

/**
 * Cadastro rapido de cliente: nome, telefone e condicao de pagamento; o resto
 * fica em "Mais dados". Sem <form> de proposito: aparece DENTRO do formulario
 * do pedido/orcamento, e form dentro de form nao funciona no navegador.
 */
export function ClienteNovo({
  onCriado,
  onCancelar,
}: {
  onCriado: (c: Cliente) => void;
  onCancelar?: () => void;
}) {
  const [f, setF] = useState(VAZIO);
  const [mais, setMais] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function salvar() {
    if (!f.nome.trim()) {
      setErro("Informe o nome do cliente.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await api<{ id: string }>("/api/clientes", { body: f });
      onCriado({
        id: r.id,
        nome: f.nome.trim(),
        documento: f.documento,
        cidade: f.cidade,
        contato: f.contato,
        telefone: f.telefone,
        email: f.email,
        vendedor: "",
        condicao: f.condicao,
        obs: f.obs,
      });
      setF(VAZIO);
      setMais(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Campo rotulo="Nome / razao social">
        <input
          autoFocus
          value={f.nome}
          onChange={set("nome")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              salvar();
            }
          }}
          className={inputCls}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Telefone">
          <input inputMode="tel" value={f.telefone} onChange={set("telefone")} className={inputCls} />
        </Campo>
        <Campo rotulo="Pagamento">
          <select value={f.condicao} onChange={set("condicao")} className={inputCls}>
            {(Object.keys(CONDICAO_LABEL) as Condicao[]).map((c) => (
              <option key={c} value={c}>
                {c === "novo" ? "50% + 50%" : "Boleto 28 dias"}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {mais ? (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="CNPJ / CPF">
            <input value={f.documento} onChange={set("documento")} className={inputCls} />
          </Campo>
          <Campo rotulo="Cidade">
            <input value={f.cidade} onChange={set("cidade")} className={inputCls} />
          </Campo>
          <Campo rotulo="Contato">
            <input value={f.contato} onChange={set("contato")} className={inputCls} />
          </Campo>
          <Campo rotulo="E-mail">
            <input type="email" value={f.email} onChange={set("email")} className={inputCls} />
          </Campo>
          <div className="col-span-2">
            <Campo rotulo="Observacao">
              <input value={f.obs} onChange={set("obs")} className={inputCls} />
            </Campo>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setMais(true)} className="text-xs text-teal-700 dark:text-teal-400 underline">
          + Mais dados (CNPJ, cidade, contato, e-mail)
        </button>
      )}
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Botao tipo="secundario" onClick={onCancelar}>
            Cancelar
          </Botao>
        )}
        <Botao onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Cadastrar cliente"}
        </Botao>
      </div>
    </div>
  );
}

/**
 * Escolha do cliente com "+ Novo" ao lado: o cliente cadastrado ali ja volta
 * selecionado, sem sair do pedido/orcamento.
 */
export function EscolherCliente({
  clientes,
  value,
  onChange,
  onClienteNovo,
}: {
  clientes: Cliente[] | null;
  value: string;
  onChange: (id: string) => void;
  onClienteNovo: (c: Cliente) => void;
}) {
  const [novo, setNovo] = useState(false);

  if (novo) {
    return (
      <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 p-3">
        <p className="text-xs font-semibold text-teal-800 dark:text-teal-300 mb-2">Novo cliente</p>
        <ClienteNovo
          onCriado={(c) => {
            onClienteNovo(c);
            onChange(c.id);
            setNovo(false);
          }}
          onCancelar={() => setNovo(false)}
        />
      </div>
    );
  }

  return (
    <Campo rotulo="Cliente">
      <div className="flex gap-2">
        <select required value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">{clientes ? (clientes.length ? "Escolha..." : "Nenhum ainda: use + Novo") : "Carregando..."}</option>
          {clientes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <Botao tipo="secundario" onClick={() => setNovo(true)} className="shrink-0">
          + Novo
        </Botao>
      </div>
    </Campo>
  );
}
