import type { Metadata } from "next";
import { listPasswordResetRequests } from "@/lib/actions/registro";
import { EmptyState } from "@/components/state/empty-state";
import { KeyRound } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResetActions } from "./reset-actions";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Vendedores pendientes" };

export default async function VendedoresPendientesPage() {
  const resets = await listPasswordResetRequests();
  if (resets.error) throw new Error(resets.error);

  return (
    <div className="space-y-10">
      <PageHeader
        breadcrumbs={[{ label: "Vendedores", href: "/admin/vendedores" }, { label: "Pendientes" }]}
        title="Vendedores pendientes"
        description="Solicitudes de restablecer contraseña."
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Solicitudes de restablecer contraseña</h2>
        {resets.data && resets.data.length > 0 ? (
          <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Tienda</TableHead>
                  <TableHead>Solicitado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {resets.data.map((r) => (
                  <TableRow key={r.requestId}>
                    <TableCell data-label="Nombre" className="font-medium">{r.fullName}</TableCell>
                    <TableCell data-label="Correo" className="text-sm text-muted-foreground">{r.email}</TableCell>
                    <TableCell data-label="Tienda" className="text-sm text-muted-foreground">{r.storeName ?? "—"}</TableCell>
                    <TableCell data-label="Solicitado" className="text-sm text-muted-foreground">
                      <span title={formatDateTime(r.requestedAt)}>{timeAgo(r.requestedAt)}</span>
                    </TableCell>
                    <TableCell data-label="" className="text-right">
                      <ResetActions requestId={r.requestId} userId={r.userId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState icon={KeyRound} title="Sin solicitudes" description="Ningún vendedor pidió restablecer su contraseña." />
        )}
      </section>
    </div>
  );
}
