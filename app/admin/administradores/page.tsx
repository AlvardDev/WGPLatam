import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteAdminDialog } from "./invite-admin-dialog";

export const metadata: Metadata = { title: "Administradores" };

type AdminRow = { id: string; full_name: string; is_active: boolean };

export default async function AdministradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  // Página exclusiva de superadmin: un admin normal puede leer /admin/* por
  // RLS (profiles_select_admin, is_admin() ya incluye a superadmin), pero
  // no debe siquiera ver esta pantalla — mínimo dato necesario, igual que
  // technical_reports para vendedor. Las RPC ya lo exigen por su cuenta
  // (admin_finalize_admin_profile/admin_set_admin_active); esto es la
  // segunda capa de UX, no la autoridad real.
  const { data: claims } = await supabase.auth.getClaims();
  const { data: self } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims?.claims?.sub ?? "")
    .single();
  if (self?.role !== "superadmin") notFound();

  let query = supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("role", "admin")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) query = query.ilike("full_name", `%${q}%`);

  const { data: admins, error } = await query.returns<AdminRow[]>();
  if (error) throw new Error("No se pudieron cargar los administradores.");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">Administradores</h1>
          <p className="text-sm text-muted-foreground">Cuentas admin del cliente dueño del negocio.</p>
        </div>
        <InviteAdminDialog />
      </div>

      <form className="flex max-w-lg items-center gap-2">
        <Input type="search" name="q" placeholder="Buscar por nombre..." defaultValue={q ?? ""} className="max-w-xs" />
      </form>

      {!admins || admins.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title={q ? "Sin resultados" : "Todavía no hay administradores"}
          description={q ? "Nada coincide con ese filtro." : "Invita a la primera cuenta admin."}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/admin/administradores/${a.id}`} className="font-medium hover:underline">
                      {a.full_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.is_active ? "secondary" : "destructive"}>
                      {a.is_active ? "Activo" : "Desactivado"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
