import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SellerActions } from "./seller-actions";

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{seller.full_name}</h1>
          <Badge variant={seller.is_active ? "secondary" : "destructive"}>
            {seller.is_active ? "Activo" : "Desactivado"}
          </Badge>
        </div>
        <SellerActions id={seller.id} isActive={seller.is_active} />
      </div>

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
