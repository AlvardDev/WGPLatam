// Barras planas (un solo hue, magnitud) en vez de degradé — ver dataviz
// skill, "Sequential = one hue". Sin librería nueva: 12 valores no
// justifican una dependencia, flexbox + <title> nativo alcanza para el
// tooltip on-hover.
function niceMax(max: number) {
  if (max <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function MonthlyBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <div className="flex gap-3">
      <div className="flex h-56 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums">
        {[...ticks].reverse().map((t) => (
          <span key={t}>{t.toLocaleString("es")}</span>
        ))}
      </div>
      <div className="flex h-56 flex-1 items-end gap-2 border-l border-b">
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div
              title={`${d.label}: ${d.value.toLocaleString("es")}`}
              className="w-full max-w-8 rounded-t-sm bg-blue-600 transition-colors hover:bg-blue-700"
              style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%` }}
            />
            <span className="text-xs text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
