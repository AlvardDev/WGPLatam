import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { WarrantyPdfDocument } from "@/lib/pdf/warranty-pdf";

// PDF bajo demanda, nunca almacenado (ver docs/ARCHITECTURE.md, "PDF" y el
// mismo patrón ya usado en app/admin/importaciones/[id]/errores/route.ts).
// RLS decide el acceso: la consulta usa la sesión del usuario, nunca el
// cliente de service role — un vendedor de otra tienda recibe 404, igual
// que si la garantía no existiera. Los datos vienen del snapshot congelado
// en "warranties", nunca de products/lots vigentes (docs/PROJECT-PLAN.md,
// sección I).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WarrantyPdfRow = {
  id: string;
  product_name: string;
  product_code: string;
  serial: string;
  barcode: string | null;
  lot_code: string;
  activated_at: string;
  expires_at: string;
  duration_days: number;
  store_attention_days: number;
  conditions: string;
  exclusions: string[];
  customer_name: string;
  customer_national_id: string;
  customer_whatsapp: string;
  voided_at: string | null;
  voided_reason: string | null;
  stores: { name: string; code: string } | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: warranty, error } = await supabase
    .from("warranties")
    .select(
      "id, product_name, product_code, serial, barcode, lot_code, activated_at, expires_at, duration_days, store_attention_days, conditions, exclusions, customer_name, customer_national_id, customer_whatsapp, voided_at, voided_reason, stores(name, code)",
    )
    .eq("id", id)
    .single<WarrantyPdfRow>();

  if (error || !warranty) return new Response("Not found", { status: 404 });

  const { data: settings } = await supabase
    .from("app_settings")
    .select("company_name, company_legal_name, company_legal_id, address, phone, email, support_email, support_phone, support_whatsapp")
    .eq("id", true)
    .single();

  const buffer = await renderToBuffer(
    WarrantyPdfDocument({
      company: {
        name: settings?.company_name || "—",
        legalName: settings?.company_legal_name || "",
        legalId: settings?.company_legal_id || "",
        address: settings?.address ?? null,
        phone: settings?.phone ?? null,
        email: settings?.email ?? null,
      },
      support: {
        email: settings?.support_email ?? null,
        phone: settings?.support_phone ?? null,
        whatsapp: settings?.support_whatsapp ?? null,
      },
      store: warranty.stores ?? { name: "—", code: "—" },
      product: { name: warranty.product_name, code: warranty.product_code },
      serial: warranty.serial,
      barcode: warranty.barcode,
      lotCode: warranty.lot_code,
      activatedAt: new Date(warranty.activated_at).toLocaleString("es"),
      expiresAt: new Date(warranty.expires_at).toLocaleDateString("es"),
      durationDays: warranty.duration_days,
      storeAttentionDays: warranty.store_attention_days,
      conditions: warranty.conditions,
      exclusions: warranty.exclusions,
      customer: {
        name: warranty.customer_name,
        nationalId: warranty.customer_national_id,
        whatsapp: warranty.customer_whatsapp,
      },
      voidedAt: warranty.voided_at ? new Date(warranty.voided_at).toLocaleString("es") : null,
      voidedReason: warranty.voided_reason,
      issuedAt: new Date().toLocaleString("es"),
    }),
  );

  const download = new URL(request.url).searchParams.get("download") === "1";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="garantia-${warranty.serial}.pdf"`,
    },
  });
}
