import type { Metadata } from "next";
import Link from "next/link";
import { Package, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateProductDialog } from "./create-product-dialog";
import { productPhotoUrl } from "@/lib/image/product-photos";
import { PageHeader } from "@/components/layout/page-header";
import { formatDuration } from "@/lib/format";

export const metadata: Metadata = { title: "Productos" };

// Sin paginación por keyset aquí a propósito: el catálogo de productos de un
// negocio real rara vez pasa de unos cientos de filas — el volumen que
// justifica keyset (docs/PHASE-2-REVIEW.md, §9) es el de "serials", donde sí
// se implementa (ver app/admin/seriales/page.tsx).
export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select("id, code, name, default_warranty_days, is_active, photo_path")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data: products, error } = await query;
  if (error) throw new Error("No se pudieron cargar los productos.");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description="Catálogo de productos y su política de garantía."
        actions={<CreateProductDialog />}
      />

      <form className="max-w-sm">
        <Input type="search" name="q" placeholder="Buscar por nombre o código..." defaultValue={q ?? ""} />
      </form>

      {!products || products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q ? "Sin resultados" : "Todavía no hay productos"}
          description={q ? `Nada coincide con "${q}".` : "Crea el primer producto para empezar."}
          action={!q ? <CreateProductDialog /> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {/* Miniatura solo si hay foto: sin placeholder vacío. */}
                      {p.photo_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={productPhotoUrl(p.photo_path)}
                          alt=""
                          className="size-8 rounded-lg object-cover"
                        />
                      ) : null}
                      <Link href={`/admin/productos/${p.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDuration(p.default_warranty_days)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "success" : "danger"}>
                      {p.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${p.name}`}
                      render={<Link href={`/admin/productos/${p.id}`} />}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
