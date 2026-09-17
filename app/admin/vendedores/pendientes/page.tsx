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

export const metadata: Metadata = { title: "Vendedores pendientes" };

export default async function VendedoresPendientesPage() {
  const resets = await listPasswordResetRequests();
  if (resets.error) throw new Error(resets.error);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendedores pendientes</h1>
        <p className="text-sm text-muted-foreground">Solicitudes de restablecer contraseña.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Solicitudes de restablecer contraseña</h2>
        {resets.data && resets.data.length > 0 ? (
          <div className="rounded-lg border">
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
                    <TableCell className="font-medium">{r.fullName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.storeName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.requestedAt).toLocaleDateString("es")}
                    </TableCell>
                    <TableCell className="text-right">
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
