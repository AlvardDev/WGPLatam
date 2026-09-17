// Encoding de status (no categórico libre): colores reservados, cada uno
// con su propio significado semántico, nunca reciclados para "serie 4" —
// ver dataviz skill, "Status colors are reserved". conic-gradient en vez de
// SVG: un donut de 4 segmentos no justifica una librería ni cálculo de
// arcos a mano.
export type DonutSegment = {
  label: string;
  value: number;
  colorClass: string; // clase de fondo Tailwind, para el punto de la leyenda
  colorHex: string; // mismo color en hex, para el conic-gradient
};

export function StatusDonutChart({
  segments,
  total,
  totalLabel,
}: {
  segments: DonutSegment[];
  total: number;
  totalLabel: string;
}) {
  let cursor = 0;
  const stops = segments
    .map((s) => {
      const pct = total > 0 ? (s.value / total) * 100 : 0;
      const start = cursor;
      cursor += pct;
      return `${s.colorHex} ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center">
      <div
        className="relative size-44 shrink-0 rounded-full"
        style={{ background: total > 0 ? `conic-gradient(${stops})` : "#e2e8f0" }}
      >
        <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white text-center">
          <span className="text-2xl font-semibold tabular-nums">{total.toLocaleString("es")}</span>
          <span className="text-xs text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className={`size-2.5 shrink-0 rounded-full ${s.colorClass}`} />
            <span className="w-24 text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">
              {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
