import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StoreEditForm } from "./store-edit-form";
import { StoreActiveToggle } from "./store-active-toggle";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteEntityDialog } from "@/components/admin/delete-entity-dialog";

export const metadata: Metadata = { title: "Tienda" };

export default async function TiendaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: store, error } = await supabase
    .from("stores")
    .select("id, code, name, address, phone, country_code, timezone, is_active")
    .eq("id", id)
    .single();

  if (error || !store) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Tiendas", href: "/admin/tiendas" }, { label: store.name }]}
        title={store.name}
        description={<span className="font-mono">{store.code}</span>}
        badge={
          <Badge variant={store.is_active ? "success" : "danger"}>
            {store.is_active ? "Activa" : "Inactiva"}
          </Badge>
        }
        actions={
          <>
            <StoreActiveToggle id={store.id} isActive={store.is_active} />
            <DeleteEntityDialog entity="store" id={store.id} label={store.name} redirectTo="/admin/tiendas" />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Editar tienda</CardTitle>
          <CardDescription>
            Desactivar una tienda le quita el acceso de inmediato a sus vendedores, aunque sigan activos
            individualmente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreEditForm
            id={store.id}
            defaultValues={{
              code: store.code,
              name: store.name,
              address: store.address ?? "",
              phone: store.phone ?? "",
              countryCode: store.country_code,
              timezone: store.timezone,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
