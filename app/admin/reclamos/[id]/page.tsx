import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignClaimButton, CloseClaimButton, DecideClaimForm } from "./claim-actions";
import { TechnicalReportForm } from "./technical-report-form";

export const metadata: Metadata = { title: "Reclamo" };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  UNDER_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CLOSED: "Cerrado",
};

type ClaimDetail = {
  id: string;
  warranty_id: string;
  reason: string;
  description: string | null;
  status: string;
  responsible_party: string;
  decision: string | null;
  decision_justification: string | null;
  closed_at: string | null;
  created_at: string;
  warranties: { product_name: string; serial: string; customer_name: string } | null;
  stores: { name: string; code: string } | null;
};

type TechnicalReportRow = {
  id: string;
  diagnosis: string;
  tests_performed: string | null;
  observations: string | null;
  result: string;
  decision: string;
  justification: string | null;
  reported_at: string;
};

export default async function ReclamoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: claim, error } = await supabase
    .from("warranty_claims")
    .select(
      "id, warranty_id, reason, description, status, responsible_party, decision, decision_justification, closed_at, created_at, warranties(product_name, serial, customer_name), stores(name, code)",
    )
    .eq("id", id)
    .single<ClaimDetail>();

  if (error || !claim) notFound();

  const { data: reports } = await supabase
    .from("technical_reports")
    .select("id, diagnosis, tests_performed, observations, result, decision, justification, reported_at")
    .eq("claim_id", id)
    .order("reported_at", { ascending: false })
    .returns<TechnicalReportRow[]>();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-blue-900">{claim.reason}</h1>
            <Badge>{STATUS_LABEL[claim.status] ?? claim.status}</Badge>
          </div>
          <Link href={`/admin/garantias/${claim.warranty_id}`} className="text-sm text-muted-foreground hover:underline">
            {claim.warranties ? `${claim.warranties.product_name} · ${claim.warranties.serial}` : "Ver garantía"}
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reclamo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Tienda</p>
            <p className="font-medium">{claim.stores ? `${claim.stores.name} (${claim.stores.code})` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Cliente</p>
            <p className="font-medium">{claim.warranties?.customer_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Responsable</p>
            <p className="font-medium">{claim.responsible_party === "STORE" ? "Tienda" : "Fabricante"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Abierto</p>
            <p className="font-medium">{new Date(claim.created_at).toLocaleString("es")}</p>
          </div>
          {claim.description && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Descripción</p>
              <p className="font-medium whitespace-pre-wrap">{claim.description}</p>
            </div>
          )}
          {claim.decision && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Resolución</p>
              <p className="font-medium">{claim.decision}</p>
              {claim.decision_justification && (
                <p className="mt-1 text-muted-foreground">{claim.decision_justification}</p>
              )}
            </div>
          )}
          {claim.closed_at && (
            <div>
              <p className="text-muted-foreground">Cerrado</p>
              <p className="font-medium">{new Date(claim.closed_at).toLocaleString("es")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {claim.status === "OPEN" && (
        <Card>
          <CardHeader>
            <CardTitle>Acción</CardTitle>
          </CardHeader>
          <CardContent>
            <AssignClaimButton claimId={claim.id} warrantyId={claim.warranty_id} />
          </CardContent>
        </Card>
      )}

      {claim.status === "UNDER_REVIEW" && (
        <Card>
          <CardHeader>
            <CardTitle>Decidir reclamo</CardTitle>
          </CardHeader>
          <CardContent>
            <DecideClaimForm claimId={claim.id} warrantyId={claim.warranty_id} />
          </CardContent>
        </Card>
      )}

      {(claim.status === "APPROVED" || claim.status === "REJECTED") && (
        <Card>
          <CardHeader>
            <CardTitle>Acción</CardTitle>
          </CardHeader>
          <CardContent>
            <CloseClaimButton claimId={claim.id} warrantyId={claim.warranty_id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reportes técnicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!reports || reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin reportes técnicos.</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <li key={r.id} className="rounded-md border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">{new Date(r.reported_at).toLocaleString("es")}</p>
                  <p className="mt-1">
                    <span className="font-medium">Diagnóstico:</span> {r.diagnosis}
                  </p>
                  {r.tests_performed && (
                    <p className="mt-1">
                      <span className="font-medium">Pruebas:</span> {r.tests_performed}
                    </p>
                  )}
                  {r.observations && (
                    <p className="mt-1">
                      <span className="font-medium">Observaciones:</span> {r.observations}
                    </p>
                  )}
                  <p className="mt-1">
                    <span className="font-medium">Resultado:</span> {r.result}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Decisión:</span> {r.decision}
                  </p>
                  {r.justification && (
                    <p className="mt-1">
                      <span className="font-medium">Justificación:</span> {r.justification}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(claim.status === "OPEN" || claim.status === "UNDER_REVIEW") && <TechnicalReportForm claimId={claim.id} />}
        </CardContent>
      </Card>
    </div>
  );
}
