// Barras planas (un solo hue, magnitud) en vez de degradé — ver dataviz
// skill, "Sequential = one hue". SVG con `height`/`y`/`x` como atributos
// (no `style` inline): la altura de cada barra depende de datos reales en
// runtime, y la CSP de proxy.ts no tiene 'unsafe-inline' en style-src — un
// style="height: N%" dinámico queda bloqueado en silencio (mismo bug ya
// encontrado y corregido en BrandPanel). Los atributos SVG no pasan por
// style-src, así que height/y/x como props normales de React sí funcionan.
function niceMax(max: number) {
  if (max <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

const HEIGHT = 224;
const BAR_RADIUS = 3;

export function MonthlyBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const slot = 100 / data.length;
  const barWidth = Math.min(slot * 0.55, 8);

  return (
    <div className="flex gap-3">
      <div className="flex h-56 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums">
        {[...ticks].reverse().map((t) => (
          <span key={t}>{t.toLocaleString("es")}</span>
        ))}
      </div>
      <div className="flex-1">
        <div className="h-56 border-b border-l">
          <svg
            viewBox={`0 0 100 ${HEIGHT}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            role="img"
            aria-label="Garantías activadas por mes"
          >
            {data.map((d, i) => {
              const barHeight = max > 0 ? Math.max((d.value / max) * HEIGHT, d.value > 0 ? 3 : 0) : 0;
              const x = i * slot + (slot - barWidth) / 2;
              return (
                <rect
                  key={d.label}
                  x={x}
                  y={HEIGHT - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={BAR_RADIUS}
                  className="fill-blue-600 transition-[fill] hover:fill-blue-700"
                >
                  <title>{`${d.label}: ${d.value.toLocaleString("es")}`}</title>
                </rect>
              );
            })}
          </svg>
        </div>
        <div className="mt-1 flex text-center text-xs text-muted-foreground">
          {data.map((d) => (
            <span key={d.label} className="flex-1">
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
