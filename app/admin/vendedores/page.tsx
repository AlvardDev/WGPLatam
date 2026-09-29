import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
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
import { CreateSellerDialog } from "./create-seller-dialog";
import { EditSellerDialog } from "./edit-seller-dialog";
import { Button } from "@/components/ui/button";
import { UserCheck } from "lucide-react";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";

export const metadata: Metadata = { title: "Vendedores" };

type SellerRow = {
  id: string;
  full_name: string;
  is_active: boolean;
  store_id: string;
  stores: { name: string; code: string } | null;
};

export default async function VendedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ tienda?: string; q?: string }>;
}) {
  const { tienda, q } = await searchParams;
  const supabase = await createClient();

  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name");
  if (storesError) throw new Error("No se pudieron cargar las tiendas.");

  let query = supabase
    .from("profiles")
    .select("id, full_name, is_active, store_id, stores(name, code)")
    .eq("role", "seller")
    .order("created_at", { ascending: false })
    .limit(200);
  if (tienda) query = query.eq("store_id", tienda);
  if (q) query = query.ilike("full_name", `%${q}%`);

  const { data: sellers, error } = await query.returns<SellerRow[]>();
  if (error) throw new Error("No se pudieron cargar los vendedores.");

  const { data: inviteStatuses } = await supabase.rpc("admin_list_seller_invite_status");
  const inviteStatusById = new Map(
    ((inviteStatuses ?? []) as { id: string; invite_status: string }[]).map((r) => [r.id, r.invite_status]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores"
        description="Cuentas de tienda que pueden activar garantías."
        actions={
          <>
            <Button variant="outline" render={<Link href="/admin/vendedores/pendientes"><UserCheck className="size-4" />Pendientes</Link>} />
            <CreateSellerDialog stores={stores ?? []} />
          </>
        }
      />

      <form className="flex max-w-lg flex-wrap items-center gap-2">
        <Input type="search" name="q" placeholder="Buscar por nombre..." defaultValue={q ?? ""} className="max-w-xs" />
        <Select
          name="tienda"
          aria-label="Tienda"
          defaultValue={tienda ?? ""}
          placeholder="Todas las tiendas"
          options={(stores ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          className="w-56"
        />
      </form>

      {!sellers || sellers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || tienda ? "Sin resultados" : "Todavía no hay vendedores"}
          description={
            q || tienda
              ? "Nada coincide con ese filtro."
              : (stores ?? []).length === 0
                ? "Crea una tienda antes de dar de alta al primer vendedor."
                : "Crea al primer vendedor de una tienda."
          }
          action={!q && !tienda && (stores ?? []).length > 0 ? <CreateSellerDialog stores={stores ?? []} /> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.map((s) => {
                const inviteStatus = inviteStatusById.get(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={s.full_name} />
                        <Link href={`/admin/vendedores/${s.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                          {s.full_name}
                        </Link>
                        <EditSellerDialog seller={s} stores={stores ?? []} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.stores ? `${s.stores.name} (${s.stores.code})` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? "success" : "danger"}>
                        {s.is_active ? "Activo" : "Desactivado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inviteStatus === "accepted" ? "info" : "warning"}>
                        {inviteStatus === "accepted" ? "Ingresó" : "Nunca inició sesión"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
