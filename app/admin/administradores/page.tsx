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
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteAdminDialog } from "./invite-admin-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { listParams, type SearchParams } from "@/lib/list-params";
import { Pagination, SortableHead } from "@/components/ui/list-controls";

export const metadata: Metadata = { title: "Administradores" };

type AdminRow = { id: string; full_name: string; is_active: boolean };

export default async function AdministradoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const lp = listParams(sp, { reciente: "created_at", nombre: "full_name", estado: "is_active" }, { key: "reciente", asc: false });
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
    .select("id, full_name, is_active", { count: "exact" })
    .eq("role", "admin")
    .order(lp.column, { ascending: lp.asc })
    .range(lp.from, lp.to);
  if (q) query = query.ilike("full_name", `%${q}%`);

  const { data: admins, count: total, error } = await query.returns<AdminRow[]>();
  // PGRST103: página fuera de rango (URL editada a mano) → lista vacía, no error.
  if (error && error.code !== "PGRST103") throw new Error("No se pudieron cargar los administradores.");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administradores"
        description="Cuentas admin del cliente dueño del negocio."
        actions={<InviteAdminDialog />}
      />

      <form className="flex max-w-lg items-center gap-2">
        <Input type="search" name="q" placeholder="Buscar por nombre..." defaultValue={q ?? ""} className="max-w-xs" />
      </form>

      {!admins || admins.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title={q ? "Sin resultados" : "Todavía no hay administradores"}
          description={q ? "Nada coincide con ese filtro." : "Invita a la primera cuenta admin."}
          action={!q ? <InviteAdminDialog /> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Nombre" sortKey="nombre" current={lp} basePath="/admin/administradores" searchParams={sp} />
                <SortableHead label="Estado" sortKey="estado" current={lp} basePath="/admin/administradores" searchParams={sp} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((a) => (
                <TableRow key={a.id}>
                  <TableCell data-label="Nombre">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar name={a.full_name} />
                      <Link href={`/admin/administradores/${a.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                        {a.full_name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell data-label="Estado">
                    <Badge variant={a.is_active ? "success" : "danger"}>
                      {a.is_active ? "Activo" : "Desactivado"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={lp.page} total={total ?? 0} basePath="/admin/administradores" searchParams={sp} />
    </div>
  );
}
