import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { ImportResume } from "./import-resume";
import { PurgeStagingButton } from "./purge-staging-button";

export const metadata: Metadata = { title: "Importación" };

type ImportDetail = {
  id: string;
  file_name: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  error_rows: number;
  committed_rows: number;
  missing_barcode_rows: number;
  created_at: string;
  lot_id: string;
  lots: { code: string; products: { name: string } | null } | null;
};

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  STAGING: "outline",
  COMMITTING: "outline",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "destructive",
};

export default async function ImportacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: imp, error } = await supabase
    .from("serial_imports")
    .select(
      "id, file_name, status, total_rows, valid_rows, duplicate_rows, error_rows, committed_rows, missing_barcode_rows, created_at, lot_id, lots(code, products(name))",
    )
    .eq("id", id)
    .single()
    .returns<ImportDetail>();

  if (error || !imp) notFound();

  const { count: stagedRemaining } = await supabase
    .from("serial_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-blue-900">{imp.file_name}</h1>
        <Badge variant={STATUS_VARIANT[imp.status] ?? "outline"}>{imp.status}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Lote: {imp.lots?.products?.name} — <span className="font-mono">{imp.lots?.code}</span>
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
        <Stat label="Total" value={imp.total_rows} />
        <Stat label="Válidas" value={imp.valid_rows} />
        <Stat label="Duplicadas" value={imp.duplicate_rows} />
        <Stat label="Con error" value={imp.error_rows} />
        <Stat label="Creadas" value={imp.committed_rows} />
        <Stat label="Sin código de barras" value={imp.missing_barcode_rows} />
      </div>

      {(imp.status === "STAGING" || imp.status === "COMMITTING" || imp.status === "FAILED") && (
        <ImportResume importId={imp.id} status={imp.status} />
      )}

      {(imp.status === "COMPLETED" || imp.status === "CANCELLED") && (stagedRemaining ?? 0) > 0 && (
        <PurgeStagingButton importId={imp.id} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
