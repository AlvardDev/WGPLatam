"use client";

import { useState } from "react";
import { ArrowRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";

// Nombres legibles de las columnas de las 13 tablas auditadas. Una columna
// que no esté acá se muestra con su nombre técnico (no se oculta).
const FIELD_LABEL: Record<string, string> = {
  full_name: "Nombre",
  name: "Nombre",
  code: "Código",
  email: "Correo",
  phone: "Teléfono",
  whatsapp: "WhatsApp",
  address: "Dirección",
  role: "Rol",
  is_active: "Activo",
  store_id: "Tienda",
  country_code: "País",
  timezone: "Zona horaria",
  description: "Descripción",
  how_it_works: "Cómo funciona",
  warranty_conditions: "Condiciones de garantía",
  warranty_exclusions: "Exclusiones",
  default_warranty_days: "Días de garantía por defecto",
  warranty_days: "Días de garantía",
  photo_path: "Foto",
  received_on: "Fecha de recepción",
  expected_count: "Cantidad esperada",
  imported_count: "Cantidad importada",
  serial: "Serial",
  barcode: "Código de barras",
  status: "Estado",
  status_reason: "Motivo del estado",
  product_name: "Producto",
  product_code: "Código de producto",
  lot_code: "Lote",
  customer_name: "Cliente",
  customer_national_id: "Identificación del cliente",
  customer_whatsapp: "WhatsApp del cliente",
  activated_at: "Activada el",
  expires_at: "Vence el",
  duration_days: "Duración (días)",
  voided_at: "Anulada el",
  voided_reason: "Motivo de anulación",
  field: "Campo",
  old_value: "Valor anterior",
  new_value: "Valor nuevo",
  reason: "Motivo",
  decision: "Decisión",
  decision_note: "Nota de la decisión",
  decision_justification: "Justificación",
  decided_at: "Decidido el",
  diagnosis: "Diagnóstico",
  result: "Resultado",
  tests_performed: "Pruebas realizadas",
  observations: "Observaciones",
  justification: "Justificación",
  responsible_party: "Responsable",
  closed_at: "Cerrado el",
  file_name: "Archivo",
  total_rows: "Filas totales",
  valid_rows: "Filas válidas",
  duplicate_rows: "Filas duplicadas",
  error_rows: "Filas con error",
  committed_rows: "Seriales creados",
  missing_barcode_rows: "Sin código de barras",
  company_name: "Nombre de la empresa",
  company_legal_name: "Razón social",
  company_legal_id: "Identificación fiscal",
  support_email: "Correo de soporte",
  support_phone: "Teléfono de soporte",
  support_whatsapp: "WhatsApp de soporte",
  store_attention_days: "Días de atención en tienda",
  expiring_soon_days: "Aviso de vencimiento (días)",
  email_enabled: "Correos activados",
  admin_notification_emails: "Correos de aviso",
  from_email: "Remitente",
  from_name: "Nombre del remitente",
  default_timezone: "Zona horaria por defecto",
  locale: "Idioma",
  national_id_label: "Nombre del documento",
  default_warranty_conditions: "Condiciones por defecto",
  default_warranty_exclusions: "Exclusiones por defecto",
  onboarding_completed_at: "Recorrido completado el",
};

// Técnicas o redundantes: no aportan al leer el evento.
const HIDDEN = new Set(["id", "created_at", "updated_at", "logo_path"]);

function formatValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "string" && /(_at|_on)$/.test(key) && !Number.isNaN(Date.parse(v))) return formatDateTime(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type Change = { key: string; label: string; before?: string; after?: string };

function changes(oldData: unknown, newData: unknown): Change[] {
  const o = (oldData && typeof oldData === "object" ? oldData : {}) as Record<string, unknown>;
  const n = (newData && typeof newData === "object" ? newData : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !HIDDEN.has(k));
  const isUpdate = Object.keys(o).length > 0 && Object.keys(n).length > 0;
  return keys
    .filter((k) => !isUpdate || JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => ({
      key: k,
      label: FIELD_LABEL[k] ?? k,
      before: k in o ? formatValue(k, o[k]) : undefined,
      after: k in n ? formatValue(k, n[k]) : undefined,
    }));
}

export function AuditDetailDialog({
  oldData,
  newData,
  metadata,
}: {
  oldData: unknown;
  newData: unknown;
  metadata: unknown;
}) {
  const [open, setOpen] = useState(false);
  const hasMetadata = metadata && typeof metadata === "object" && Object.keys(metadata).length > 0;
  const rows = changes(oldData, newData);
  const isUpdate = !!oldData && !!newData;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Ver detalle">
            <Eye className="size-4" />
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isUpdate ? "Qué cambió" : newData ? "Datos registrados" : oldData ? "Datos eliminados" : "Detalle del evento"}
          </DialogTitle>
        </DialogHeader>

        {rows.length > 0 ? (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/40 text-sm">
            {rows.map((r) => (
              <li key={r.key} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
                <span className="text-muted-foreground">{r.label}</span>
                {isUpdate ? (
                  <span className="flex flex-wrap items-center gap-1.5 break-words">
                    <span className="text-muted-foreground line-through decoration-red-400/60">{r.before}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{r.after}</span>
                  </span>
                ) : (
                  <span className="font-medium break-words">{r.after ?? r.before}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isUpdate ? "No hubo cambios visibles en los datos." : "Sin datos adicionales para este evento."}
          </p>
        )}

        {oldData || newData || hasMetadata ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">Ver datos técnicos</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/60 p-2">
              {JSON.stringify({ antes: oldData, despues: newData, metadata }, null, 2)}
            </pre>
          </details>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
