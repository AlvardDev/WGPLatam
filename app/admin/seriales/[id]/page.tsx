import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SerialActions } from "./serial-actions";

export const metadata: Metadata = { title: "Serial" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  AVAILABLE: "secondary",
  ACTIVATED: "outline",
  BLOCKED: "destructive",
  VOID: "destructive",
};

// Ver nota de tipos en app/admin/lotes/page.tsx.
type SerialDetailRow = {
  id: string;
  serial: string;
  barcode: string;
  status: string;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  products: { name: string; code: string } | null;
  lots: { code: string } | null;
};

export default async function SerialDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: serial, error } = await supabase
    .from("serials")
    .select(
      "id, serial, barcode, status, status_reason, created_at, updated_at, products(name, code), lots!serials_lot_id_fkey(code)",
    )
    .eq("id", id)
    .single()
    .returns<SerialDetailRow>();

  if (error || !serial) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-blue-900">{serial.serial}</h1>
          <Badge variant={STATUS_VARIANT[serial.status] ?? "outline"}>{serial.status}</Badge>
        </div>
        <SerialActions id={serial.id} status={serial.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Código de barras</p>
            <p className="font-mono text-sm">{serial.barcode}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Producto</p>
            <p className="text-sm">
              {serial.products?.name} ({serial.products?.code})
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Lote</p>
            <p className="font-mono text-sm">{serial.lots?.code}</p>
          </div>
          {serial.status_reason && (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">Motivo</p>
              <p className="text-sm">{serial.status_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
