import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "cn";

export function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  alert,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  /** Cambio real (p. ej. "nuevos este mes") — nunca inventado; se omite
   * cuando no hay un dato honesto y barato de calcular para esa métrica. */
  delta?: { value: string; direction: "up" | "down" };
  alert?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-white p-5">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          alert ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold tabular-nums", alert && "text-red-600")}>{value}</p>
        {delta ? (
          <p
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              delta.direction === "up" ? "text-emerald-600" : "text-red-500",
            )}
          >
            {delta.direction === "up" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {delta.value}
          </p>
        ) : null}
      </div>
    </div>
  );
}
