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
import { InviteSellerDialog } from "./invite-seller-dialog";
import { Button } from "@/components/ui/button";
import { UserCheck } from "lucide-react";

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">Vendedores</h1>
          <p className="text-sm text-muted-foreground">Cuentas de tienda que pueden activar garantías.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/admin/vendedores/pendientes"><UserCheck className="size-4" />Pendientes</Link>} />
          <InviteSellerDialog stores={stores ?? []} />
        </div>
      </div>

      <form className="flex max-w-lg flex-wrap items-center gap-2">
        <Input type="search" name="q" placeholder="Buscar por nombre..." defaultValue={q ?? ""} className="max-w-xs" />
        <select
          name="tienda"
          defaultValue={tienda ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todas las tiendas</option>
          {(stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
      </form>

      {!sellers || sellers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || tienda ? "Sin resultados" : "Todavía no hay vendedores"}
          description={
            q || tienda
              ? "Nada coincide con ese filtro."
              : (stores ?? []).length === 0
                ? "Crea una tienda antes de invitar al primer vendedor."
                : "Invita al primer vendedor de una tienda."
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Invitación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.map((s) => {
                const inviteStatus = inviteStatusById.get(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/admin/vendedores/${s.id}`} className="font-medium hover:underline">
                        {s.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.stores ? `${s.stores.name} (${s.stores.code})` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? "secondary" : "destructive"}>
                        {s.is_active ? "Activo" : "Desactivado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inviteStatus === "accepted" ? "secondary" : "outline"}>
                        {inviteStatus === "accepted" ? "Aceptada" : inviteStatus === "pending" ? "Sin aceptar" : "—"}
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
