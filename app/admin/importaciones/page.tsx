import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Importaciones" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  STAGING: "outline",
  COMMITTING: "outline",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "destructive",
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

export default async function ImportacionesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("serial_imports")
    .select("id, file_name, status, total_rows, valid_rows, committed_rows, created_at, lots(code, products(name))")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<ImportRow[]>();
  if (error) throw new Error("No se pudieron cargar las importaciones.");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Importaciones</h1>
          <p className="text-sm text-muted-foreground">Carga masiva de seriales por archivo CSV o Excel.</p>
        </div>
        <Button render={<Link href="/admin/importaciones/nueva">Nueva importación</Link>} />
      </div>

      {!data || data.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Todavía no hay importaciones"
          description="Crea una importación para cargar seriales masivamente en un lote."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Archivo</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Progreso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell>
                    <Link href={`/admin/importaciones/${imp.id}`} className="text-sm font-medium hover:underline">
                      {imp.file_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {imp.lots?.products?.name} · <span className="font-mono">{imp.lots?.code}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {imp.committed_rows} / {imp.total_rows || "?"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[imp.status] ?? "outline"}>{imp.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(imp.created_at).toLocaleString("es")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
