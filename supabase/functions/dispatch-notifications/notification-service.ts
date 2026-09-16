import type { SendResult } from "./email-provider.ts";

export type NotificationRow = {
  id: number;
  type: string;
  recipient: string;
  payload: { warranty_id?: string };
};

export type WarrantySummary = {
  product_name: string;
  serial: string;
  customer_name: string;
  activated_at: string;
  store_name: string;
};

// Pura: construye asunto/cuerpo a partir del tipo de evento. Separada de
// processPending para poder probarla sin red ni base de datos (ver
// notification-service.test.ts). Único evento real de F6: warranty_activated
// (aviso interno a los correos de notification_settings.admin_notification_emails
// — no hay tabla "customers" ni correo del cliente, ver docs/DATABASE.md).
export function buildEmail(type: string, warranty: WarrantySummary | null): { subject: string; html: string } {
  if (type === "warranty_activated" && warranty) {
    return {
      subject: `Garantía activada: ${warranty.product_name} (${warranty.serial})`,
      html: `<p>Se activó una garantía en <strong>${warranty.store_name}</strong>.</p>
<ul>
  <li>Producto: ${warranty.product_name}</li>
  <li>Serial: ${warranty.serial}</li>
  <li>Cliente: ${warranty.customer_name}</li>
  <li>Fecha: ${warranty.activated_at}</li>
</ul>`,
    };
  }
  return { subject: `Notificación: ${type}`, html: `<p>Evento: ${type}</p>` };
}

export type ProcessDeps = {
  claim: (batchSize: number) => Promise<NotificationRow[]>;
  complete: (id: number, ok: boolean, error: string | null) => Promise<void>;
  getWarranty: (warrantyId: string) => Promise<WarrantySummary | null>;
  getFrom: () => Promise<{ from: string }>;
  send: (to: string, from: string, subject: string, html: string) => Promise<SendResult>;
};

// Orquesta un lote: reclama (claim_notifications ya marcó PROCESSING e
// incrementó attempts, ver la migración), arma el email, envía, y cierra
// cada fila con el resultado real del proveedor (nunca SENT sin
// confirmación). Un fallo de un item no aborta el resto del lote.
export async function processPending(
  deps: ProcessDeps,
  batchSize = 20,
): Promise<{ processed: number; sent: number; failed: number }> {
  const batch = await deps.claim(batchSize);
  const { from } = await deps.getFrom();
  let sent = 0;
  let failed = 0;

  for (const n of batch) {
    const warranty = n.payload.warranty_id ? await deps.getWarranty(n.payload.warranty_id) : null;
    const { subject, html } = buildEmail(n.type, warranty);
    const result = await deps.send(n.recipient, from, subject, html);
    if (result.ok) {
      sent++;
      await deps.complete(n.id, true, null);
    } else {
      failed++;
      await deps.complete(n.id, false, result.error);
    }
  }

  return { processed: batch.length, sent, failed };
}
