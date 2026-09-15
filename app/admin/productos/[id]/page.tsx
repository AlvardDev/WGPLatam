import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductEditForm } from "./product-edit-form";
import { ProductActiveToggle } from "./product-active-toggle";

export const metadata: Metadata = { title: "Producto" };

export default async function ProductoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id, code, name, description, how_it_works, warranty_conditions, warranty_exclusions, default_warranty_days, is_active",
    )
    .eq("id", id)
    .single();

  if (error || !product) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
            <p className="font-mono text-sm text-muted-foreground">{product.code}</p>
          </div>
          <Badge variant={product.is_active ? "secondary" : "destructive"}>
            {product.is_active ? "Activo" : "Inactivo"}
          </Badge>
        </div>
        <ProductActiveToggle id={product.id} isActive={product.is_active} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editar producto</CardTitle>
          <CardDescription>El código no se puede modificar una vez creado.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductEditForm
            id={product.id}
            productCode={product.code}
            defaultValues={{
              name: product.name,
              description: product.description ?? "",
              howItWorks: product.how_it_works ?? "",
              warrantyConditions: product.warranty_conditions,
              warrantyExclusions: (product.warranty_exclusions ?? []).join("\n"),
              defaultWarrantyDays: product.default_warranty_days,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
