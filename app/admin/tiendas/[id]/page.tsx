import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StoreEditForm } from "./store-edit-form";
import { StoreActiveToggle } from "./store-active-toggle";

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-blue-900">{store.name}</h1>
            <p className="font-mono text-sm text-muted-foreground">{store.code}</p>
          </div>
          <Badge variant={store.is_active ? "secondary" : "destructive"}>
            {store.is_active ? "Activa" : "Inactiva"}
          </Badge>
        </div>
        <StoreActiveToggle id={store.id} isActive={store.is_active} />
      </div>

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
