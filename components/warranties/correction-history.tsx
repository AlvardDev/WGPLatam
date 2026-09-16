import { Badge } from "@/components/ui/badge";

const FIELD_LABELS: Record<string, string> = {
  customer_name: "Nombre",
  customer_national_id: "Identificación",
  customer_whatsapp: "WhatsApp",
};

const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

export type CorrectionRow = {
  id: string;
  field: string;
  old_value: string;
  new_value: string;
  reason: string;
  status: string;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

// Presentacional puro: usado tal cual en /tienda (solo lectura) y como base
// de /admin (que agrega los botones de decisión alrededor de cada fila
// PENDING vía "renderActions").
export function CorrectionHistory({
  corrections,
  renderActions,
}: {
  corrections: CorrectionRow[];
  renderActions?: (correction: CorrectionRow) => React.ReactNode;
}) {
  if (corrections.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin correcciones solicitadas.</p>;
  }

  return (
    <ul className="space-y-3">
      {corrections.map((c) => (
        <li key={c.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{FIELD_LABELS[c.field] ?? c.field}</span>
            <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            <span className="line-through">{c.old_value}</span> → <span className="font-medium">{c.new_value}</span>
          </p>
          <p className="mt-1 text-muted-foreground">Motivo: {c.reason}</p>
          {c.decided_at && (
            <p className="mt-1 text-muted-foreground">
              Decidida el {new Date(c.decided_at).toLocaleString("es")}
              {c.decision_note ? ` — ${c.decision_note}` : ""}
            </p>
          )}
          {c.status === "PENDING" && renderActions ? <div className="mt-2">{renderActions(c)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
