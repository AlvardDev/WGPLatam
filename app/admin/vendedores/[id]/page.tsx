import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SellerActions } from "./seller-actions";
import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ChangePasswordDialog } from "./change-password-dialog";
import { getSellerAccount } from "@/lib/auth/seller-accounts";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Vendedor" };

type SellerDetail = {
  id: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  stores: { name: string; code: string } | null;
};

export default async function VendedorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: seller, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active, created_at, stores(name, code)")
    .eq("id", id)
    .eq("role", "seller")
    .single<SellerDetail>();

  if (error || !seller) notFound();
  const account = await getSellerAccount(seller.id);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Vendedores", href: "/admin/vendedores" }, { label: seller.full_name }]}
        leading={<UserAvatar name={seller.full_name} size="lg" />}
        title={seller.full_name}
        badge={
          <Badge variant={seller.is_active ? "success" : "danger"}>
            {seller.is_active ? "Activo" : "Desactivado"}
          </Badge>
        }
        actions={
          <>
            <ChangePasswordDialog id={seller.id} name={seller.full_name} />
            <SellerActions id={seller.id} isActive={seller.is_active} />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos de la cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Correo (usuario para entrar)</dt>
              <dd className="font-medium break-all">{account?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contraseña</dt>
              <dd className="font-medium">
                ••••••••{" "}
                <span className="text-xs font-normal text-muted-foreground">(cifrada, no se puede ver)</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tienda</dt>
              <dd className="font-medium">{seller.stores ? `${seller.stores.name} (${seller.stores.code})` : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Último ingreso</dt>
              <dd className="font-medium">
                {account?.lastSignInAt ? (
                  <span title={formatDateTime(account.lastSignInAt)}>{timeAgo(account.lastSignInAt)}</span>
                ) : (
                  "Nunca inició sesión"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Creado el</dt>
              <dd className="font-medium">{formatDate(seller.created_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
