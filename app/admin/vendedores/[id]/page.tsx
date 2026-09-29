import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SellerActions } from "./seller-actions";
import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";

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
        actions={<SellerActions id={seller.id} isActive={seller.is_active} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos de la cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Tienda: </span>
            {seller.stores ? `${seller.stores.name} (${seller.stores.code})` : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Invitado el: </span>
            {new Date(seller.created_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
