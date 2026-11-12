"use client";

import type { ReactNode } from "react";

/** Pecas visuais comuns das telas do ASApp (mesmo estilo do SApp, cor teal). */

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: string; acoes?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">{titulo}</h1>
        {subtitulo && <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}

export function Pagina({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-5 pb-28 md:px-8 lg:py-8 max-w-7xl mx-auto">{children}</div>;
}

export function Card({ titulo, children, className = "" }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 md:p-5 ${className}`}
    >
      {titulo && <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{titulo}</h2>}
      {children}
    </section>
  );
}

const TOM = {
  neutro: "text-gray-900 dark:text-gray-100",
  ok: "text-emerald-600 dark:text-emerald-400",
  alerta: "text-rose-600 dark:text-rose-400",
  atencao: "text-amber-600 dark:text-amber-400",
} as const;

export function Numero({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: keyof typeof TOM;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{rotulo}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${TOM[tom]}`}>{valor}</p>
      {detalhe && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{detalhe}</p>}
    </div>
  );
}

export function Botao({
  children,
  onClick,
  tipo = "primario",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  tipo?: "primario" | "secundario" | "perigo";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const cor =
    tipo === "primario"
      ? "bg-teal-700 hover:bg-teal-800 text-white"
      : tipo === "perigo"
        ? "bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        : "bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${cor} ${className}`}
    >
      {children}
    </button>
  );
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600 dark:text-gray-400 text-xs">{rotulo}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600";

export function Aviso({ tipo, children }: { tipo: "erro" | "ok" | "info"; children: ReactNode }) {
  const cls =
    tipo === "erro"
      ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-200"
      : tipo === "ok"
        ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-200"
        : "bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950 dark:border-sky-900 dark:text-sky-200";
  return <div className={`border rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Etiqueta({ children, cor = "cinza" }: { children: ReactNode; cor?: "cinza" | "verde" | "vermelho" | "amarelo" | "azul" }) {
  const cls = {
    cinza: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    verde: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    vermelho: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    amarelo: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    azul: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  }[cor];
  return <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

export function Carregando() {
  return <p className="text-sm text-gray-500 animate-pulse">Carregando...</p>;
}
