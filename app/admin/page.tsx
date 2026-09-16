import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

export const metadata: Metadata = { title: "Panel" };

// KPIs reales, Fase 9 (docs/PROJECT-PLAN.md, fila 9 — "dashboard admin" era
// explícitamente trabajo diferido desde la Fase 1). Cada número es un
// count(*) filtrado vía PostgREST (head:true, mismo patrón ya usado en
// app/admin/importaciones/[id]/page.tsx), sin RPC nueva: son las mismas
// tablas y el mismo RLS de admin que ya usan /admin/garantias,
// /admin/reclamos, /admin/seriales, etc. Estados derivados de garantías
// (activa/por vencer/vencida) calculados con voided_at/expires_at — la
// granularidad que el comentario de app/admin/garantias/page.tsx ya dejaba
// anotada como "se agrega cuando haga falta".
export default async function AdminPage() {
  const supabase = await createClient();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const in30Days = new Date(nowDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: garantiasActivas },
    { count: garantiasPorVencer },
    { count: garantiasVencidas },
    { count: garantiasAnuladas },
    { count: reclamosAbiertos },
    { count: reclamosEnRevision },
    { count: correccionesPendientes },
    { count: serialesDisponibles },
    { count: serialesActivados },
    { count: serialesBloqueados },
    { count: tiendasActivas },
    { count: vendedoresActivos },
    { count: notificacionesFallidas },
  ] = await Promise.all([
    supabase.from("warranties").select("id", { count: "exact", head: true }).is("voided_at", null).gt("expires_at", now),
    supabase
      .from("warranties")
      .select("id", { count: "exact", head: true })
      .is("voided_at", null)
      .gt("expires_at", now)
      .lte("expires_at", in30Days),
    supabase.from("warranties").select("id", { count: "exact", head: true }).is("voided_at", null).lte("expires_at", now),
    supabase.from("warranties").select("id", { count: "exact", head: true }).not("voided_at", "is", null),
    supabase.from("warranty_claims").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
    supabase.from("warranty_claims").select("id", { count: "exact", head: true }).eq("status", "UNDER_REVIEW"),
    supabase.from("warranty_corrections").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    supabase.from("serials").select("id", { count: "exact", head: true }).eq("status", "AVAILABLE"),
    supabase.from("serials").select("id", { count: "exact", head: true }).eq("status", "ACTIVATED"),
    supabase.from("serials").select("id", { count: "exact", head: true }).in("status", ["BLOCKED", "VOID"]),
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "seller").eq("is_active", true),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("status", "FAILED"),
  ]);

  const grupos: { titulo: string; stats: { label: string; value: number; alert?: boolean }[] }[] = [
    {
      titulo: "Garantías",
      stats: [
        { label: "Activas", value: garantiasActivas ?? 0 },
        { label: "Por vencer (30 días)", value: garantiasPorVencer ?? 0 },
        { label: "Vencidas", value: garantiasVencidas ?? 0 },
        { label: "Anuladas", value: garantiasAnuladas ?? 0 },
      ],
    },
    {
      titulo: "Reclamos y correcciones",
      stats: [
        { label: "Reclamos abiertos", value: reclamosAbiertos ?? 0 },
        { label: "Reclamos en revisión", value: reclamosEnRevision ?? 0 },
        { label: "Correcciones pendientes", value: correccionesPendientes ?? 0 },
      ],
    },
    {
      titulo: "Inventario de seriales",
      stats: [
        { label: "Disponibles", value: serialesDisponibles ?? 0 },
        { label: "Activados", value: serialesActivados ?? 0 },
        { label: "Bloqueados/anulados", value: serialesBloqueados ?? 0 },
      ],
    },
    {
      titulo: "Operación",
      stats: [
        { label: "Tiendas activas", value: tiendasActivas ?? 0 },
        { label: "Vendedores activos", value: vendedoresActivos ?? 0 },
        {
          label: "Notificaciones fallidas",
          value: notificacionesFallidas ?? 0,
          alert: (notificacionesFallidas ?? 0) > 0,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">Indicadores en tiempo real de todas las tiendas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {grupos.map((grupo) => (
          <Card key={grupo.titulo}>
            <CardHeader>
              <CardTitle>{grupo.titulo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {grupo.stats.map((stat) => (
                <div key={stat.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <span className={cn("text-lg font-semibold tabular-nums", stat.alert && "text-destructive")}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
