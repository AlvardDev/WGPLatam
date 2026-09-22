import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Lock, ScanBarcode, ShieldCheck, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/admin/kpi-card";
import { CreateSerialDialog } from "./create-serial-dialog";
import { SerialesTable, type SerialRow } from "./seriales-table";
import { PrevPageButton } from "./prev-page-button";

export const metadata: Metadata = { title: "Seriales" };

const PAGE_SIZE = 50;

type SerialQueryRow = {
  id: string;
  serial: string;
  barcode: string | null;
  status: string;
  created_at: string;
  product_id: string;
  lot_id: string;
  products: { name: string; code: string } | null;
  lots: { code: string } | null;
  // PostgREST embebe warranties(...) como objeto cuando detecta la
  // relación 1:1 (serial_id es UNIQUE) pero como array en versiones/casos
  // donde no la infiere — se normalizan ambas formas abajo en vez de
  // asumir una sola.
  warranties: { duration_days: number; customer_name: string } | { duration_days: number; customer_name: string }[] | null;
};

// Paginación por keyset (created_at desc, id desc), no por offset: es la
// única tabla de la Fase 2 que de verdad puede llegar a cientos de miles de
// filas (ver docs/PHASE-2-REVIEW.md, §9). Solo "Siguiente" avanza por
// cursor real; "Anterior" usa el historial del navegador (la URL de cada
// página ya queda en el historial) en vez de mantener una pila de cursores
// — decisión explícita del usuario: restylear la paginación, no cambiar su
// mecanismo (nada de conteo total exacto ni números de página saltables).
export default async function SerialesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    producto?: string;
    lote?: string;
    status?: string;
    barcode?: string;
    cursor?: string;
  }>;
}) {
  const { q, producto, lote, status, barcode, cursor } = await searchParams;
  const supabase = await createClient();

  const [{ data: products }, { data: lots }, { count: totalSeriales }, { count: disponibles }, { count: activos }, { count: bloqueados }] =
    await Promise.all([
      supabase.from("products").select("id, code, name").eq("is_active", true).order("name"),
      supabase.from("lots").select("id, code, product_id").eq("is_active", true).order("code"),
      supabase.from("serials").select("id", { count: "exact", head: true }),
      supabase.from("serials").select("id", { count: "exact", head: true }).eq("status", "AVAILABLE"),
      supabase.from("serials").select("id", { count: "exact", head: true }).eq("status", "ACTIVATED"),
      supabase.from("serials").select("id", { count: "exact", head: true }).in("status", ["BLOCKED", "VOID"]),
    ]);

  let query = supabase
    .from("serials")
    .select(
      "id, serial, barcode, status, created_at, product_id, lot_id, products(name, code), lots!serials_lot_id_fkey(code), warranties(duration_days, customer_name)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (q) {
    const normalized = q.trim().toUpperCase();
    query = query.or(`serial.eq.${normalized},barcode.eq.${normalized}`);
  }
  if (producto) query = query.eq("product_id", producto);
  if (lote) query = query.eq("lot_id", lote);
  if (status) query = query.eq("status", status);
  if (barcode === "falta") query = query.is("barcode", null);
  if (barcode === "pendiente") {
    const { data: pending } = await supabase
      .from("serial_barcode_waivers")
      .select("serial_id")
      .eq("status", "PENDING");
    const pendingIds = (pending ?? []).map((w) => w.serial_id);
    // .in() con array vacío es ambiguo entre versiones de PostgREST — un id
    // imposible da el mismo resultado (cero filas) sin ese riesgo.
    query = query.in("id", pendingIds.length > 0 ? pendingIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (cursor) {
    const [cCreatedAt, cId] = cursor.split("|");
    if (cCreatedAt && cId) {
      query = query.or(`created_at.lt.${cCreatedAt},and(created_at.eq.${cCreatedAt},id.lt.${cId})`);
    }
  }

  const { data, error } = await query.returns<SerialQueryRow[]>();
  if (error) throw new Error("No se pudieron cargar los seriales.");

  const hasMore = (data ?? []).length > PAGE_SIZE;
  const page = (data ?? []).slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;

  const serials: SerialRow[] = page.map((s) => ({
    id: s.id,
    serial: s.serial,
    barcode: s.barcode,
    status: s.status,
    created_at: s.created_at,
    products: s.products,
    lots: s.lots,
    warranty: Array.isArray(s.warranties) ? (s.warranties[0] ?? null) : s.warranties,
  }));

  const nextParams = new URLSearchParams();
  if (q) nextParams.set("q", q);
  if (producto) nextParams.set("producto", producto);
  if (lote) nextParams.set("lote", lote);
  if (status) nextParams.set("status", status);
  if (barcode) nextParams.set("barcode", barcode);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  const filteredLots = producto ? (lots ?? []).filter((l) => l.product_id === producto) : (lots ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">Seriales</h1>
          <p className="text-sm text-muted-foreground">Gestiona y consulta todos los seriales de tus productos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/admin/importaciones/nueva" />}>
            <Upload className="size-4" />
            Importar seriales
          </Button>
          <CreateSerialDialog products={products ?? []} lots={lots ?? []} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ScanBarcode} label="Total de seriales" value={(totalSeriales ?? 0).toLocaleString("es")} />
        <KpiCard icon={CheckCircle2} label="Disponibles" value={(disponibles ?? 0).toLocaleString("es")} />
        <KpiCard icon={ShieldCheck} label="Activos (con garantía)" value={(activos ?? 0).toLocaleString("es")} />
        <KpiCard icon={Lock} label="Bloqueados / Anulados" value={(bloqueados ?? 0).toLocaleString("es")} alert={(bloqueados ?? 0) > 0} />
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
        <div className="w-full max-w-xs">
          <Input type="search" name="q" placeholder="Buscar por serial o código de barras..." defaultValue={q ?? ""} />
        </div>
        <select
          name="producto"
          defaultValue={producto ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los productos</option>
          {(products ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          name="lote"
          defaultValue={lote ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los lotes</option>
          {filteredLots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los estados</option>
          <option value="AVAILABLE">Disponible</option>
          <option value="ACTIVATED">Activado</option>
          <option value="BLOCKED">Bloqueado</option>
          <option value="VOID">Anulado</option>
        </select>
        <select
          name="barcode"
          defaultValue={barcode ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Con o sin código de barras</option>
          <option value="falta">Sin código de barras</option>
          <option value="pendiente">Con autorización pendiente</option>
        </select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {(q || producto || lote || status || barcode) && (
          <Button variant="ghost" render={<Link href="/admin/seriales">Limpiar filtros</Link>} />
        )}
      </form>

      {serials.length === 0 ? (
        <EmptyState
          icon={ScanBarcode}
          title="Sin seriales"
          description="Crea un serial dentro de un lote activo, o ajusta los filtros."
        />
      ) : (
        <>
          <SerialesTable serials={serials} />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {serials.length} de {(totalSeriales ?? 0).toLocaleString("es")} seriales
            </p>
            <div className="flex gap-2">
              <PrevPageButton hasCursor={!!cursor} />
              {nextCursor && (
                <Button variant="outline" size="icon" render={<Link href={`/admin/seriales?${nextParams.toString()}`} aria-label="Siguiente" />}>
                  →
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
