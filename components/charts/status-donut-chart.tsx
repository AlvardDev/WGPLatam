// Encoding de status (no categórico libre): colores reservados, cada uno
// con su propio significado semántico, nunca reciclados para "serie 4" —
// ver dataviz skill, "Status colors are reserved". SVG con
// strokeDasharray/strokeDashoffset como atributos (no `style` inline): la
// CSP de proxy.ts no tiene 'unsafe-inline' en style-src, y un
// conic-gradient dinámico solo se puede expresar como style="" — con
// atributos SVG el valor va en el árbol de atributos normal, no bloqueado.
export type DonutSegment = {
  label: string;
  value: number;
  colorClass: string; // clase de fondo Tailwind, para el punto de la leyenda
  colorHex: string; // mismo color en hex, para el trazo del arco
};

const SIZE = 160;
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function StatusDonutChart({
  segments,
  total,
  totalLabel,
}: {
  segments: DonutSegment[];
  total: number;
  totalLabel: string;
}) {
  let cumulative = 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth={STROKE} />
          {total > 0
            ? segments
                .filter((s) => s.value > 0)
                .map((s) => {
                  const length = (s.value / total) * CIRCUMFERENCE;
                  const gap = CIRCUMFERENCE - length;
                  const offset = -((cumulative / total) * CIRCUMFERENCE);
                  cumulative += s.value;
                  return (
                    <circle
                      key={s.label}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={s.colorHex}
                      strokeWidth={STROKE}
                      strokeDasharray={`${length} ${gap}`}
                      strokeDashoffset={offset}
                      strokeLinecap={segments.filter((x) => x.value > 0).length === 1 ? "butt" : "round"}
                    >
                      <title>{`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`}</title>
                    </circle>
                  );
                })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold tabular-nums">{total.toLocaleString("es")}</span>
          <span className="text-xs text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className={`size-2.5 shrink-0 rounded-full ${s.colorClass}`} />
            <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
