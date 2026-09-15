import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditCustomerForm } from "./edit-customer-form";

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
      "id, product_name, product_code, serial, barcode, lot_code, activated_at, expires_at, duration_days, conditions, exclusions, customer_name, customer_national_id, customer_whatsapp",
    )
    .eq("id", id)
    .single();

  if (error || !warranty) notFound();

  const editableUntil = new Date(new Date(warranty.activated_at).getTime() + EDIT_WINDOW_HOURS * 60 * 60 * 1000);
  const canEdit = new Date() < editableUntil;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{warranty.product_name}</h1>
        <p className="font-mono text-sm text-muted-foreground">{warranty.serial}</p>
      </div>

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
              : "Pasaron más de 24 horas: ya no se puede editar aquí (la corrección con aprobación llega en una fase posterior)."}
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
