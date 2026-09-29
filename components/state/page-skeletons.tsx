import { Skeleton } from "@/components/ui/skeleton";

function HeaderSkeleton({ breadcrumb, action }: { breadcrumb?: boolean; action?: boolean }) {
  return (
    <div className="space-y-2">
      {breadcrumb ? <Skeleton className="h-4 w-40" /> : null}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        {action ? <Skeleton className="h-9 w-32 rounded-xl" /> : null}
      </div>
    </div>
  );
}

/** Carga de una página de listado: encabezado, filtros y tabla con la forma real. */
export function ListPageSkeleton({ kpis = false, cols = 4, rows = 8 }: { kpis?: boolean; cols?: number; rows?: number }) {
  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <HeaderSkeleton action />
      {kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 rounded-2xl bg-card p-5 shadow-soft">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <Skeleton className="h-9 w-72 max-w-full rounded-xl" />
      <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
        <div className="flex gap-4 bg-muted/60 px-4 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={c === 0 ? "h-4 flex-[1.4]" : "h-4 flex-1"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Carga de una página de detalle: ruta, título y tarjetas. */
export function DetailPageSkeleton() {
  return (
    <div className="animate-in space-y-6 fade-in duration-300">
      <HeaderSkeleton breadcrumb action />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl bg-card p-5 shadow-soft">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-4 rounded-2xl bg-card p-5 shadow-soft lg:col-span-2">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
