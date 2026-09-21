import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/state/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Reclamos" };

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

type ClaimListRow = {
  id: string;
  reason: string;
  status: string;
  responsible_party: string;
  created_at: string;
  warranties: { product_name: string; serial: string } | null;
  stores: { name: string; code: string } | null;
};

export default async function ReclamosPage() {
  const supabase = await createClient();
  const { data: claims, error } = await supabase
    .from("warranty_claims")
    .select("id, reason, status, responsible_party, created_at, warranties(product_name, serial), stores(name, code)")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<ClaimListRow[]>();

  if (error) throw new Error("No se pudieron cargar los reclamos.");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-blue-900">Reclamos</h1>
        <p className="text-sm text-muted-foreground">Últimos 100 reclamos, de todas las tiendas.</p>
      </div>

      <div data-onboarding-target="claims-list">
      {!claims || claims.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Todavía no hay reclamos abiertos" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Abierto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/reclamos/${c.id}`} className="font-medium hover:underline">
                      {c.reason}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.warranties ? `${c.warranties.product_name} · ${c.warranties.serial}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.stores ? `${c.stores.name} (${c.stores.code})` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.responsible_party === "STORE" ? "Tienda" : "Fabricante"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("es")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </div>
    </div>
  );
}
