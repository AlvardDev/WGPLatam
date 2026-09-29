import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { listParams, type SearchParams } from "@/lib/list-params";
import { Pagination, SortableHead } from "@/components/ui/list-controls";

export const metadata: Metadata = { title: "Importaciones" };

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  STAGING: "info",
  COMMITTING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  STAGING: "Vista previa",
  COMMITTING: "Importando",
  COMPLETED: "Completada",
  FAILED: "Falló",
  CANCELLED: "Cancelada",
};

// Ver nota de tipos en app/admin/lotes/page.tsx: sin tipos generados de
// Supabase, un embed many-to-one se infiere como array.
type ImportRow = {
  id: string;
  file_name: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  committed_rows: number;
  created_at: string;
  lots: { code: string; products: { name: string } | null } | null;
};

export default async function ImportacionesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const lp = listParams(sp, { creada: "created_at", archivo: "file_name", progreso: "committed_rows", estado: "status" }, { key: "creada", asc: false });
  const supabase = await createClient();

  const { data, count: total, error } = await supabase
    .from("serial_imports")
    .select("id, file_name, status, total_rows, valid_rows, committed_rows, created_at, lots(code, products(name))", { count: "exact" })
    .order(lp.column, { ascending: lp.asc })
    .range(lp.from, lp.to)
    .returns<ImportRow[]>();
  // PGRST103: página fuera de rango (URL editada a mano) → lista vacía, no error.
  if (error && error.code !== "PGRST103") throw new Error("No se pudieron cargar las importaciones.");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importaciones"
        description="Carga masiva de seriales por archivo CSV o Excel."
        actions={
          <Button
            data-onboarding-target="new-import"
            render={<Link href="/admin/importaciones/nueva">Nueva importación</Link>}
          />
        }
      />

      {!data || data.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Todavía no hay importaciones"
          description="Crea una importación para cargar seriales masivamente en un lote."
          action={<Button render={<Link href="/admin/importaciones/nueva">Nueva importación</Link>} />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Archivo" sortKey="archivo" current={lp} basePath="/admin/importaciones" searchParams={sp} />
                <TableHead>Lote</TableHead>
                <SortableHead label="Progreso" sortKey="progreso" current={lp} basePath="/admin/importaciones" searchParams={sp} />
                <SortableHead label="Estado" sortKey="estado" current={lp} basePath="/admin/importaciones" searchParams={sp} />
                <SortableHead label="Creada" sortKey="creada" current={lp} basePath="/admin/importaciones" searchParams={sp} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell data-label="Archivo">
                    <Link href={`/admin/importaciones/${imp.id}`} className="row-link text-sm font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                      {imp.file_name}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Lote" className="text-sm text-muted-foreground">
                    {imp.lots?.products?.name} · <span className="font-mono">{imp.lots?.code}</span>
                  </TableCell>
                  <TableCell data-label="Progreso" className="text-sm text-muted-foreground">
                    {imp.committed_rows} / {imp.total_rows || "?"}
                  </TableCell>
                  <TableCell data-label="Estado">
                    <Badge variant={STATUS_VARIANT[imp.status] ?? "outline"}>{STATUS_LABEL[imp.status] ?? imp.status}</Badge>
                  </TableCell>
                  <TableCell data-label="Creada" className="text-sm text-muted-foreground">
                    {new Date(imp.created_at).toLocaleString("es")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={lp.page} total={total ?? 0} basePath="/admin/importaciones" searchParams={sp} />
    </div>
  );
}
