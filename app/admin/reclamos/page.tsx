import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
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
import { formatDateTime, timeAgo } from "@/lib/format";
import { listParams, type SearchParams } from "@/lib/list-params";
import { Pagination, SortableHead } from "@/components/ui/list-controls";

export const metadata: Metadata = { title: "Reclamos" };

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  OPEN: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CLOSED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  UNDER_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CLOSED: "Cerrado",
};

type ClaimListRow = {
  id: string;
  reason: string;
  status: string;
  responsible_party: string;
  created_at: string;
  warranties: { product_name: string; serial: string } | null;
  stores: { name: string; code: string } | null;
};

export default async function ReclamosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const lp = listParams(sp, { abierto: "created_at", motivo: "reason", responsable: "responsible_party", estado: "status" }, { key: "abierto", asc: false });
  const supabase = await createClient();
  const { data: claims, count: total, error } = await supabase
    .from("warranty_claims")
    .select("id, reason, status, responsible_party, created_at, warranties(product_name, serial), stores(name, code)", { count: "exact" })
    .order(lp.column, { ascending: lp.asc })
    .range(lp.from, lp.to)
    .returns<ClaimListRow[]>();

  // PGRST103: página fuera de rango (URL editada a mano) → lista vacía, no error.
  if (error && error.code !== "PGRST103") throw new Error("No se pudieron cargar los reclamos.");

  return (
    <div className="space-y-6">
      <PageHeader title="Reclamos" description="Últimos 100 reclamos, de todas las tiendas." />

      <div data-onboarding-target="claims-list">
      {!claims || claims.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Todavía no hay reclamos abiertos" />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Motivo" sortKey="motivo" current={lp} basePath="/admin/reclamos" searchParams={sp} />
                <TableHead>Garantía</TableHead>
                <TableHead>Tienda</TableHead>
                <SortableHead label="Responsable" sortKey="responsable" current={lp} basePath="/admin/reclamos" searchParams={sp} />
                <SortableHead label="Estado" sortKey="estado" current={lp} basePath="/admin/reclamos" searchParams={sp} />
                <SortableHead label="Abierto" sortKey="abierto" current={lp} basePath="/admin/reclamos" searchParams={sp} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell data-label="Motivo">
                    <Link href={`/admin/reclamos/${c.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                      {c.reason}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Garantía" className="text-sm text-muted-foreground">
                    {c.warranties ? `${c.warranties.product_name} · ${c.warranties.serial}` : "—"}
                  </TableCell>
                  <TableCell data-label="Tienda" className="text-sm text-muted-foreground">
                    {c.stores ? `${c.stores.name} (${c.stores.code})` : "—"}
                  </TableCell>
                  <TableCell data-label="Responsable" className="text-sm text-muted-foreground">
                    {c.responsible_party === "STORE" ? "Tienda" : "Fabricante"}
                  </TableCell>
                  <TableCell data-label="Estado">
                    <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </TableCell>
                  <TableCell data-label="Abierto" className="text-sm text-muted-foreground">
                    <span title={formatDateTime(c.created_at)}>{timeAgo(c.created_at)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </div>
      <Pagination page={lp.page} total={total ?? 0} basePath="/admin/reclamos" searchParams={sp} />
    </div>
  );
}
