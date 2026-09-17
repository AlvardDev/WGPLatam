import { Skeleton } from "@/components/ui/skeleton";

// Fallback de Suspense que Next monta automáticamente al cambiar de módulo
// en el sidebar (mientras el page.tsx del nuevo módulo hace sus queries).
// Forma genérica título + KPIs + tabla porque calza con casi todos los
// módulos admin; anima con fade-in al aparecer y con animate-pulse
// (heredado de Skeleton) mientras espera.
export default function AdminLoading() {
  return (
    <div className="animate-in space-y-6 fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border bg-white p-5">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border bg-white p-4">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
