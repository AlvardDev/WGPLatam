import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Box,
  ClipboardList,
  Package,
  PackageSearch,
  Search,
  ShieldCheck,
  Truck,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";
import { KpiCard } from "@/components/admin/kpi-card";
import { MonthlyBarChart } from "@/components/charts/monthly-bar-chart";
import { StatusDonutChart } from "@/components/charts/status-donut-chart";

export const metadata: Metadata = { title: "Panel" };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { start: start.toISOString(), end: end.toISOString(), label: MESES[start.getMonth()] };
}

const WARRANTY_STATUS_BADGE: Record<string, string> = {
  Activa: "bg-emerald-100 text-emerald-700",
  Vencida: "bg-red-100 text-red-700",
  Anulada: "bg-slate-200 text-slate-600",
};

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
  const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString();
  const months = Array.from({ length: 12 }, (_, i) => monthRange(11 - i));

  const { data: claimsData } = await supabase.auth.getClaims();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", claimsData?.claims?.sub ?? "")
    .single();

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
    { count: totalProductos },
    { count: productosNuevosEsteMes },
    { count: totalSeriales },
    { count: serialesNuevosEsteMes },
    { count: garantiasNuevasEsteMes },
    { data: ultimasGarantias },
    { data: ultimosProductos },
    { data: ultimosLotes },
    { data: ultimasImportaciones },
    monthlyWarrantyCounts,
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
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
    supabase.from("serials").select("id", { count: "exact", head: true }),
    supabase.from("serials").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
    supabase.from("warranties").select("id", { count: "exact", head: true }).gte("activated_at", startOfMonth),
    supabase
      .from("warranties")
      .select("id, product_name, serial, customer_name, activated_at, expires_at, voided_at")
      .order("activated_at", { ascending: false })
      .limit(5),
    supabase.from("products").select("id, name, created_at").order("created_at", { ascending: false }).limit(3),
    supabase.from("lots").select("id, code, created_at").order("created_at", { ascending: false }).limit(3),
    supabase
      .from("serial_imports")
      .select("id, file_name, committed_rows, updated_at")
      .eq("status", "COMPLETED")
      .order("updated_at", { ascending: false })
      .limit(3),
    Promise.all(
      months.map(({ start, end }) =>
        supabase
          .from("warranties")
          .select("id", { count: "exact", head: true })
          .gte("activated_at", start)
          .lt("activated_at", end),
      ),
    ),
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

  const barData = months.map((m, i) => ({ label: m.label, value: monthlyWarrantyCounts[i].count ?? 0 }));

  const donutTotal =
    (garantiasActivas ?? 0) + (garantiasPorVencer ?? 0) + (garantiasVencidas ?? 0) + (garantiasAnuladas ?? 0);

  function warrantyStatusLabel(w: { voided_at: string | null; expires_at: string }) {
    if (w.voided_at) return "Anulada";
    if (new Date(w.expires_at) <= nowDate) return "Vencida";
    return "Activa";
  }

  type Activity = { id: string; icon: typeof ShieldCheck; title: string; subtitle: string; at: string };
  const activity: Activity[] = [
    ...(ultimasGarantias ?? []).slice(0, 3).map((w) => ({
      id: `w-${w.id}`,
      icon: ShieldCheck,
      title: "Garantía activada",
      subtitle: `Serial ${w.serial} · ${w.customer_name}`,
      at: w.activated_at,
    })),
    ...(ultimosProductos ?? []).map((p) => ({
      id: `p-${p.id}`,
      icon: Package,
      title: "Producto agregado",
      subtitle: p.name,
      at: p.created_at,
    })),
    ...(ultimosLotes ?? []).map((l) => ({
      id: `l-${l.id}`,
      icon: Box,
      title: "Lote creado",
      subtitle: `Lote ${l.code}`,
      at: l.created_at,
    })),
    ...(ultimasImportaciones ?? []).map((imp) => ({
      id: `i-${imp.id}`,
      icon: Upload,
      title: "Seriales importados",
      subtitle: `${imp.committed_rows} seriales · ${imp.file_name}`,
      at: imp.updated_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  const acciones = [
    {
      href: "/admin/seriales",
      icon: Search,
      title: "Buscar serial",
      subtitle: "Consultar estado de un serial",
    },
    {
      href: "/admin/importaciones/nueva",
      icon: Upload,
      title: "Importar seriales",
      subtitle: "Desde archivo Excel o CSV",
    },
    {
      href: "/admin/productos",
      icon: PackageSearch,
      title: "Gestionar productos",
      subtitle: "Agregar o editar productos",
    },
    {
      href: "/admin/reclamos",
      icon: AlertTriangle,
      title: "Ver reclamos",
      subtitle: "Revisar reclamos abiertos",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">
            ¡Bienvenido, {profile?.full_name ?? "Administrador"}!
          </h1>
          <p className="text-sm text-muted-foreground">Aquí tienes un resumen del estado de tu sistema de garantías.</p>
        </div>
        <p className="text-sm font-medium text-blue-600">
          {nowDate.toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" })}
          {" · "}
          {nowDate.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Package}
          label="Total de productos"
          value={totalProductos ?? 0}
          delta={
            (productosNuevosEsteMes ?? 0) > 0
              ? { value: `+${productosNuevosEsteMes} este mes`, direction: "up" }
              : undefined
          }
        />
        <KpiCard
          icon={ClipboardList}
          label="Seriales registrados"
          value={(totalSeriales ?? 0).toLocaleString("es")}
          delta={
            (serialesNuevosEsteMes ?? 0) > 0
              ? { value: `+${serialesNuevosEsteMes} este mes`, direction: "up" }
              : undefined
          }
        />
        <KpiCard
          icon={ShieldCheck}
          label="Garantías activas"
          value={(garantiasActivas ?? 0).toLocaleString("es")}
          delta={
            (garantiasNuevasEsteMes ?? 0) > 0
              ? { value: `+${garantiasNuevasEsteMes} este mes`, direction: "up" }
              : undefined
          }
        />
        <KpiCard icon={Truck} label="Garantías por vencer" value={garantiasPorVencer ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Garantías por mes</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBarChart data={barData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Estado de garantías</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDonutChart
              total={donutTotal}
              totalLabel="Total"
              segments={[
                { label: "Activas", value: garantiasActivas ?? 0, colorClass: "bg-blue-600", colorHex: "#2563eb" },
                { label: "Por vencer", value: garantiasPorVencer ?? 0, colorClass: "bg-amber-500", colorHex: "#f59e0b" },
                { label: "Vencidas", value: garantiasVencidas ?? 0, colorClass: "bg-red-500", colorHex: "#ef4444" },
                { label: "Anuladas", value: garantiasAnuladas ?? 0, colorClass: "bg-slate-300", colorHex: "#cbd5e1" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Últimas garantías registradas</CardTitle>
            <Link href="/admin/garantias" className="text-sm text-blue-600 hover:underline">
              Ver todas →
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!ultimasGarantias || ultimasGarantias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay garantías activadas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Serial</th>
                    <th className="pb-2 font-medium">Producto</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 font-medium">Fecha</th>
                    <th className="pb-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimasGarantias.map((w) => {
                    const statusLabel = warrantyStatusLabel(w);
                    return (
                      <tr key={w.id} className="border-b last:border-0">
                        <td className="py-2">
                          <Link href={`/admin/garantias/${w.id}`} className="font-mono text-xs hover:underline">
                            {w.serial}
                          </Link>
                        </td>
                        <td className="py-2">{w.product_name}</td>
                        <td className="py-2 text-muted-foreground">{w.customer_name}</td>
                        <td className="py-2 text-muted-foreground">
                          {new Date(w.activated_at).toLocaleDateString("es")}
                        </td>
                        <td className="py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", WARRANTY_STATUS_BADGE[statusLabel])}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <a.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(a.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Acciones rápidas</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {acciones.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-center gap-3 rounded-xl border bg-white p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <a.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-muted-foreground">Detalle completo</h2>
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
    </div>
  );
}
