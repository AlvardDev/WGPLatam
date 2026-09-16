import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LotEditForm } from "./lot-edit-form";
import { LotActiveToggle } from "./lot-active-toggle";

export const metadata: Metadata = { title: "Lote" };

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Disponibles",
  ACTIVATED: "Activados",
  BLOCKED: "Bloqueados",
  VOID: "Anulados",
};

// Ver nota de tipos en app/admin/lotes/page.tsx.
type LotDetailRow = {
  id: string;
  code: string;
  warranty_days: number;
  received_on: string | null;
  expected_count: number | null;
  imported_count: number;
  is_active: boolean;
  product_id: string;
  products: { name: string; code: string } | null;
};

export default async function LoteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lot, error } = await supabase
    .from("lots")
    .select("id, code, warranty_days, received_on, expected_count, imported_count, is_active, product_id, products(name, code)")
    .eq("id", id)
    .single()
    .returns<LotDetailRow>();

  if (error || !lot) notFound();

  // count(*) por estado en vez de traer cada fila: un lote real puede tener
  // cientos de miles de seriales (Fase 3), y sumar en el servidor de Next.js
  // sería exactamente el "cargar grandes datasets completos en el frontend"
  // que el proyecto prohíbe. Usa el índice serials_lot_status_idx
  // (lot_id, status), igual que el resto de las consultas de esta pantalla.
  const [available, activated, blocked, voidCount] = await Promise.all(
    (["AVAILABLE", "ACTIVATED", "BLOCKED", "VOID"] as const).map((status) =>
      supabase.from("serials").select("id", { count: "exact", head: true }).eq("lot_id", id).eq("status", status),
    ),
  );
  const counts: Record<string, number> = {
    AVAILABLE: available.count ?? 0,
    ACTIVATED: activated.count ?? 0,
    BLOCKED: blocked.count ?? 0,
    VOID: voidCount.count ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{lot.code}</h1>
            <p className="text-sm text-muted-foreground">
              {lot.products?.name} ({lot.products?.code})
            </p>
          </div>
          <Badge variant={lot.is_active ? "secondary" : "destructive"}>
            {lot.is_active ? "Activo" : "Inactivo"}
          </Badge>
        </div>
        <LotActiveToggle id={lot.id} isActive={lot.is_active} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seriales</CardTitle>
          <CardDescription>
            {lot.imported_count} cargados
            {lot.expected_count ? ` de ${lot.expected_count} esperados (informativo)` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {Object.entries(STATUS_LABEL).map(([status, label]) => (
            <div key={status}>
              <p className="text-2xl font-semibold tabular-nums">{counts[status]}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editar lote</CardTitle>
        </CardHeader>
        <CardContent>
          <LotEditForm
            id={lot.id}
            defaultValues={{
              code: lot.code,
              warrantyDays: lot.warranty_days,
              receivedOn: lot.received_on ?? "",
              expectedCount: lot.expected_count != null ? String(lot.expected_count) : "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
