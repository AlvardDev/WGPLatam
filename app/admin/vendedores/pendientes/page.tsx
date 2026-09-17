import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listPendingSignups, listPasswordResetRequests } from "@/lib/actions/registro";
import { EmptyState } from "@/components/state/empty-state";
import { UserCheck, KeyRound } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SignupActions } from "./signup-actions";
import { ResetActions } from "./reset-actions";

export const metadata: Metadata = { title: "Vendedores pendientes" };

export default async function VendedoresPendientesPage() {
  const supabase = await createClient();
  const [{ data: stores, error: storesError }, signups, resets] = await Promise.all([
    supabase.from("stores").select("id, code, name").eq("is_active", true).order("name"),
    listPendingSignups(),
    listPasswordResetRequests(),
  ]);
  if (storesError) throw new Error("No se pudieron cargar las tiendas.");
  if (signups.error) throw new Error(signups.error);
  if (resets.error) throw new Error(resets.error);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendedores pendientes</h1>
        <p className="text-sm text-muted-foreground">
          Auto-registros esperando autorización y solicitudes de restablecer contraseña.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Registros pendientes</h2>
        {signups.data && signups.data.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Tienda solicitada</TableHead>
                  <TableHead>Registrado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {signups.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.fullName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {stores?.find((st) => st.id === s.requestedStoreId)?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString("es")}
                    </TableCell>
                    <TableCell className="text-right">
                      <SignupActions
                        userId={s.id}
                        fullName={s.fullName}
                        requestedStoreId={s.requestedStoreId}
                        stores={stores ?? []}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState icon={UserCheck} title="Sin registros pendientes" description="No hay auto-registros esperando autorización." />
        )}
      </section>

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
