import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CorrectionHistory, type CorrectionRow } from "@/components/warranties/correction-history";
import { ClaimHistory, type ClaimRow } from "@/components/warranties/claim-history";
import { EditCustomerForm } from "./edit-customer-form";
import { RequestCorrectionForm } from "./request-correction-form";
import { OpenClaimForm } from "./open-claim-form";

export const metadata: Metadata = { title: "Garantía" };

const EDIT_WINDOW_HOURS = 24;

export default async function GarantiaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: warranty, error } = await supabase
    .from("warranties")
    .select(
      "id, product_name, product_code, serial, barcode, lot_code, activated_at, expires_at, duration_days, conditions, exclusions, customer_name, customer_national_id, customer_whatsapp, voided_at, voided_reason",
    )
    .eq("id", id)
    .single();

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

  const hasOpenClaim = (claims ?? []).some((c) => c.status === "OPEN" || c.status === "UNDER_REVIEW");

  const editableUntil = new Date(new Date(warranty.activated_at).getTime() + EDIT_WINDOW_HOURS * 60 * 60 * 1000);
  const canEdit = !warranty.voided_at && new Date() < editableUntil;
  const canRequestCorrection = !warranty.voided_at && !canEdit;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{warranty.product_name}</h1>
            {warranty.voided_at && <Badge variant="destructive">Anulada</Badge>}
          </div>
          <p className="font-mono text-sm text-muted-foreground">{warranty.serial}</p>
        </div>
        <Button render={<a href={`/api/garantias/${warranty.id}/comprobante?download=1`} />}>
          Descargar comprobante
        </Button>
      </div>

      {warranty.voided_at && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Esta garantía fue anulada el {new Date(warranty.voided_at).toLocaleString("es")}. Motivo: {warranty.voided_reason}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Garantía</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Código de producto</p>
            <p className="font-medium">{warranty.product_code}</p>
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
          <CardDescription>
            {canEdit
              ? "Se puede corregir hasta 24 horas después de la activación."
              : canRequestCorrection
                ? "Pasaron más de 24 horas: cualquier cambio queda pendiente de aprobación de un administrador."
                : "Garantía anulada: los datos del cliente ya no se pueden modificar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <EditCustomerForm
              warrantyId={warranty.id}
              defaultValues={{
                name: warranty.customer_name,
                nationalId: warranty.customer_national_id,
                whatsapp: warranty.customer_whatsapp,
              }}
            />
          ) : canRequestCorrection ? (
            <RequestCorrectionForm
              warrantyId={warranty.id}
              current={{
                name: warranty.customer_name,
                nationalId: warranty.customer_national_id,
                whatsapp: warranty.customer_whatsapp,
              }}
            />
          ) : (
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Nombre</dt>
                <dd className="font-medium">{warranty.customer_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Identificación</dt>
                <dd className="font-medium">{warranty.customer_national_id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">WhatsApp</dt>
                <dd className="font-medium">{warranty.customer_whatsapp}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {corrections && corrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Correcciones solicitadas</CardTitle>
          </CardHeader>
          <CardContent>
            <CorrectionHistory corrections={corrections} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reclamos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ClaimHistory claims={claims ?? []} />
          {!warranty.voided_at && !hasOpenClaim && <OpenClaimForm warrantyId={warranty.id} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">{warranty.conditions || "—"}</p>
          {warranty.exclusions.length > 0 && (
            <ul className="list-inside list-disc text-muted-foreground">
              {warranty.exclusions.map((e: string) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
