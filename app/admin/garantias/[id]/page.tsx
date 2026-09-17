import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { CorrectionHistory, type CorrectionRow } from "@/components/warranties/correction-history";
import { ClaimHistory, type ClaimRow } from "@/components/warranties/claim-history";
import { DecideCorrectionButtons } from "./decide-correction-buttons";
import { VoidWarrantyForm } from "./void-warranty-form";

export const metadata: Metadata = { title: "Garantía" };

type WarrantyDetail = {
  id: string;
  product_name: string;
  product_code: string;
  serial: string;
  barcode: string;
  lot_code: string;
  activated_at: string;
  expires_at: string;
  duration_days: number;
  conditions: string;
  exclusions: string[];
  customer_name: string;
  customer_national_id: string;
  customer_whatsapp: string;
  voided_at: string | null;
  voided_reason: string | null;
  stores: { name: string; code: string } | null;
};

export default async function GarantiaAdminDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: warranty, error } = await supabase
    .from("warranties")
    .select(
      "id, product_name, product_code, serial, barcode, lot_code, activated_at, expires_at, duration_days, conditions, exclusions, customer_name, customer_national_id, customer_whatsapp, voided_at, voided_reason, stores(name, code)",
    )
    .eq("id", id)
    .single<WarrantyDetail>();

  if (error || !warranty) notFound();

  const { data: corrections } = await supabase
    .from("warranty_corrections")
    .select("id, field, old_value, new_value, reason, status, decided_at, decision_note, created_at")
    .eq("warranty_id", id)
    .order("created_at", { ascending: false })
    .returns<CorrectionRow[]>();

  const { data: claims } = await supabase
    .from("warranty_claims")
    .select("id, reason, description, status, responsible_party, decision, decision_justification, closed_at, created_at")
    .eq("warranty_id", id)
    .order("created_at", { ascending: false })
    .returns<ClaimRow[]>();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-blue-900">{warranty.product_name}</h1>
            {warranty.voided_at && <Badge variant="destructive">Anulada</Badge>}
          </div>
          <p className="font-mono text-sm text-muted-foreground">{warranty.serial}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<a href={`/api/garantias/${warranty.id}/comprobante?download=1`} />}>
            Descargar comprobante
          </Button>
          {!warranty.voided_at && <VoidWarrantyForm warrantyId={warranty.id} />}
        </div>
      </div>

      {warranty.voided_at && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Anulada el {new Date(warranty.voided_at).toLocaleString("es")}. Motivo: {warranty.voided_reason}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Garantía</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Tienda</p>
            <p className="font-medium">{warranty.stores ? `${warranty.stores.name} (${warranty.stores.code})` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lote</p>
            <p className="font-medium">{warranty.lot_code}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Activada</p>
            <p className="font-medium">{new Date(warranty.activated_at).toLocaleString("es")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Vence</p>
            <p className="font-medium">{new Date(warranty.expires_at).toLocaleDateString("es")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Duración</p>
            <p className="font-medium">{warranty.duration_days} días</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Nombre</p>
            <p className="font-medium">{warranty.customer_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Identificación</p>
            <p className="font-medium">{warranty.customer_national_id}</p>
          </div>
          <div>
            <p className="text-muted-foreground">WhatsApp</p>
            <p className="font-medium">{warranty.customer_whatsapp}</p>
          </div>
        </CardContent>
      </Card>

      {corrections && corrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Correcciones</CardTitle>
          </CardHeader>
          <CardContent>
            <CorrectionHistory
              corrections={corrections}
              renderActions={(c) => <DecideCorrectionButtons correctionId={c.id} warrantyId={warranty.id} />}
            />
          </CardContent>
        </Card>
      )}

      {claims && claims.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reclamos</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimHistory
              claims={claims}
              linkToDetail={(c) => (
                <Link href={`/admin/reclamos/${c.id}`} className="text-sm font-medium hover:underline">
                  Ver reclamo →
                </Link>
              )}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
