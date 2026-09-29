import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductEditForm } from "./product-edit-form";
import { ProductActiveToggle } from "./product-active-toggle";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteEntityDialog } from "@/components/admin/delete-entity-dialog";

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
      "id, code, name, description, how_it_works, warranty_conditions, warranty_exclusions, default_warranty_days, is_active, photo_path",
    )
    .eq("id", id)
    .single();

  if (error || !product) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Productos", href: "/admin/productos" }, { label: product.name }]}
        title={product.name}
        description={<span className="font-mono">{product.code}</span>}
        badge={
          <Badge variant={product.is_active ? "success" : "danger"}>
            {product.is_active ? "Activo" : "Inactivo"}
          </Badge>
        }
        actions={
          <>
            <ProductActiveToggle id={product.id} isActive={product.is_active} />
            <DeleteEntityDialog entity="product" id={product.id} label={product.name} redirectTo="/admin/productos" />
          </>
        }
      />

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
              photoPath: product.photo_path,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
