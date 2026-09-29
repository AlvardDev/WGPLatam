import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { ExpiryCell } from "@/components/warranties/expiry-cell";
import { formatDateTime, timeAgo } from "@/lib/format";
import { listParams, type SearchParams } from "@/lib/list-params";
import { Pagination, SortableHead } from "@/components/ui/list-controls";

export const metadata: Metadata = { title: "Garantías" };

// Visor mínimo de solo lectura, igual que /admin/auditoria: consultar
// garantías globalmente es una capacidad de admin ya documentada desde la
// Fase 1 (docs/ARCHITECTURE.md); un panel con filtros/estado derivado
// (activa/por vencer/vencida) no es parte del alcance pedido para esta
// fase — lo mínimo aquí es suficiente para verificar que la activación
// funciona de punta a punta.
type WarrantyRow = {
  id: string;
  product_name: string;
  serial: string;
  customer_name: string;
  activated_at: string;
  expires_at: string;
  voided_at: string | null;
  stores: { name: string; code: string } | null;
};

export default async function GarantiasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const lp = listParams(sp, { activada: "activated_at", producto: "product_name", serial: "serial", cliente: "customer_name", vence: "expires_at" }, { key: "activada", asc: false });
  const supabase = await createClient();
  const { data: warranties, count: total, error } = await supabase
    .from("warranties")
    .select("id, product_name, serial, customer_name, activated_at, expires_at, voided_at, stores(name, code)", { count: "exact" })
    .order(lp.column, { ascending: lp.asc })
    .range(lp.from, lp.to)
    .returns<WarrantyRow[]>();

  // PGRST103: página fuera de rango (URL editada a mano) → lista vacía, no error.
  if (error && error.code !== "PGRST103") throw new Error("No se pudieron cargar las garantías.");

  return (
    <div className="space-y-6">
      <PageHeader title="Garantías" description="Últimas 100 activaciones, de todas las tiendas." />

      <div data-onboarding-target="warranties-list">
      {!warranties || warranties.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Todavía no hay garantías activadas" />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Producto" sortKey="producto" current={lp} basePath="/admin/garantias" searchParams={sp} />
                <SortableHead label="Serial" sortKey="serial" current={lp} basePath="/admin/garantias" searchParams={sp} />
                <TableHead>Tienda</TableHead>
                <SortableHead label="Cliente" sortKey="cliente" current={lp} basePath="/admin/garantias" searchParams={sp} />
                <SortableHead label="Activada" sortKey="activada" current={lp} basePath="/admin/garantias" searchParams={sp} />
                <SortableHead label="Vence" sortKey="vence" current={lp} basePath="/admin/garantias" searchParams={sp} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {warranties.map((w) => (
                <TableRow key={w.id}>
                  <TableCell data-label="Producto">
                    <Link href={`/admin/garantias/${w.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                      {w.product_name}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Serial" className="font-mono text-sm">{w.serial}</TableCell>
                  <TableCell data-label="Tienda" className="text-sm text-muted-foreground">
                    {w.stores ? `${w.stores.name} (${w.stores.code})` : "—"}
                  </TableCell>
                  <TableCell data-label="Cliente" className="text-sm text-muted-foreground">{w.customer_name}</TableCell>
                  <TableCell data-label="Activada" className="text-sm text-muted-foreground">
                    <span title={formatDateTime(w.activated_at)}>{timeAgo(w.activated_at)}</span>
                  </TableCell>
                  <TableCell data-label="Vence">
                    <ExpiryCell expiresAt={w.expires_at} voidedAt={w.voided_at} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </div>
      <Pagination page={lp.page} total={total ?? 0} basePath="/admin/garantias" searchParams={sp} />
    </div>
  );
}
