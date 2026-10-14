"use client";

export interface BarChartDatum {
  mes: string;
  faturado: number;
  recebido: number;
  gastos_pagos: number;
}

function formatCompact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}

/**
 * Grafico SVG de barras agrupadas (3 series por mes).
 * Usado no dashboard pra mostrar faturado/recebido/gastos dos ultimos 6 meses.
 */
export function BarChart({ data }: { data: BarChartDatum[] }) {
  if (data.length === 0) return <p className="text-gray-400 text-sm">Sem dados</p>;

  const allValues = data.flatMap((d) => [d.faturado, d.recebido, d.gastos_pagos]);
  const max = Math.max(...allValues, 1);

  const chartHeight = 200;
  const barWidth = 24;
  const groupGap = 40;
  const barGap = 4;
  const groupWidth = barWidth * 3 + barGap * 2;
  const chartWidth = data.length * (groupWidth + groupGap) - groupGap + 40;

  return (
    <div className="overflow-x-auto">
      <svg
        width={chartWidth}
        height={chartHeight + 40}
        className="mx-auto"
        aria-label="Grafico de barras evolucao financeira"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <g key={pct}>
            <line
              x1={40}
              y1={chartHeight * (1 - pct)}
              x2={chartWidth}
              y2={chartHeight * (1 - pct)}
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              strokeWidth={1}
            />
            <text
              x={36}
              y={chartHeight * (1 - pct) + 4}
              textAnchor="end"
              className="fill-gray-400 text-[10px]"
            >
              {formatCompact(max * pct)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const x = 40 + i * (groupWidth + groupGap);
          const hFat = (d.faturado / max) * chartHeight;
          const hRec = (d.recebido / max) * chartHeight;
          const hGas = (d.gastos_pagos / max) * chartHeight;

          return (
            <g key={d.mes}>
              <rect
                x={x}
                y={chartHeight - hFat}
                width={barWidth}
                height={hFat}
                className="fill-blue-400"
                rx={3}
              />
              <rect
                x={x + barWidth + barGap}
                y={chartHeight - hRec}
                width={barWidth}
                height={hRec}
                className="fill-emerald-400"
                rx={3}
              />
              <rect
                x={x + (barWidth + barGap) * 2}
                y={chartHeight - hGas}
                width={barWidth}
                height={hGas}
                className="fill-rose-300"
                rx={3}
              />
              <text
                x={x + groupWidth / 2}
                y={chartHeight + 20}
                textAnchor="middle"
                className="fill-gray-500 dark:fill-gray-400 text-[11px]"
              >
                {d.mes}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
