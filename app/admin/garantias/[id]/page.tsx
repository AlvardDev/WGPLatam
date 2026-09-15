import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      "id, product_name, product_code, serial, barcode, lot_code, activated_at, expires_at, duration_days, conditions, exclusions, customer_name, customer_national_id, customer_whatsapp, stores(name, code)",
    )
    .eq("id", id)
    .single<WarrantyDetail>();

  if (error || !warranty) notFound();

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
    </div>
  );
}
