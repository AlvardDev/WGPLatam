import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  OPEN: "secondary",
  UNDER_REVIEW: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  CLOSED: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  UNDER_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CLOSED: "Cerrado",
};

const RESPONSIBLE_LABEL: Record<string, string> = {
  STORE: "Tienda",
  MANUFACTURER: "Fabricante",
};

export type ClaimRow = {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  responsible_party: string;
  decision: string | null;
  decision_justification: string | null;
  closed_at: string | null;
  created_at: string;
};

// Presentacional puro, mismo patrón que CorrectionHistory (Fase 6): usado
// tal cual en /tienda (solo lectura) y como base de /admin/reclamos (que
// agrega enlace al detalle con las acciones de transición).
export function ClaimHistory({
  claims,
  linkToDetail,
}: {
  claims: ClaimRow[];
  linkToDetail?: (claim: ClaimRow) => React.ReactNode;
}) {
  if (claims.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin reclamos abiertos.</p>;
  }

  return (
    <ul className="space-y-3">
      {claims.map((c) => (
        <li key={c.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{c.reason}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{RESPONSIBLE_LABEL[c.responsible_party] ?? c.responsible_party}</Badge>
              <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
            </div>
          </div>
          {c.description && <p className="mt-1 text-muted-foreground">{c.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Abierto el {new Date(c.created_at).toLocaleString("es")}
          </p>
          {c.decision && (
            <p className="mt-1 text-muted-foreground">
              Resolución: {c.decision}
              {c.decision_justification ? ` — ${c.decision_justification}` : ""}
            </p>
          )}
          {c.closed_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Cerrado el {new Date(c.closed_at).toLocaleString("es")}
            </p>
          )}
          {linkToDetail ? <div className="mt-2">{linkToDetail(c)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
