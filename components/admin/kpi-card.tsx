import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "cn";
import { CountUp } from "@/components/ui/count-up";

const TONE = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  red: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
} as const;

/** % de cambio entre este mes y el anterior; null si el mes anterior fue 0 (no hay base honesta). */
export function monthOverMonth(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "blue",
  hint,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: keyof typeof TONE;
  /** Texto chico bajo el número, p. ej. "12 este mes". */
  hint?: string;
  /** Cambio real vs el mes anterior; nunca inventado (se omite si no hay base). */
  trend?: { pct: number; label: string } | null;
}) {
  const up = trend && trend.pct > 0;
  const down = trend && trend.pct < 0;
  const TrendIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;

  return (
    <div className="group flex animate-in items-start gap-4 rounded-2xl bg-card p-5 shadow-soft transition-transform duration-200 fade-in slide-in-from-bottom-2 hover:-translate-y-0.5">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
          TONE[tone],
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          <CountUp value={value} />
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
                up && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                down && "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
                !up && !down && "bg-muted text-muted-foreground",
              )}
            >
              <TrendIcon className="size-3" />
              {trend.pct > 0 ? "+" : ""}
              {trend.pct}% {trend.label}
            </span>
          ) : null}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}
