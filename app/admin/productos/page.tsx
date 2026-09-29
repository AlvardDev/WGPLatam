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
import { listParams, type SearchParams } from "@/lib/list-params";
import { Pagination, SortableHead } from "@/components/ui/list-controls";

export const metadata: Metadata = { title: "Productos" };

// Sin paginación por keyset aquí a propósito: el catálogo de productos de un
// negocio real rara vez pasa de unos cientos de filas — el volumen que
// justifica keyset (docs/PHASE-2-REVIEW.md, §9) es el de "serials", donde sí
// se implementa (ver app/admin/seriales/page.tsx).
export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const lp = listParams(sp, { reciente: "created_at", codigo: "code", nombre: "name", garantia: "default_warranty_days", estado: "is_active" }, { key: "reciente", asc: false });
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select("id, code, name, default_warranty_days, is_active, photo_path", { count: "exact" })
    .order(lp.column, { ascending: lp.asc })
    .range(lp.from, lp.to);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data: products, count: total, error } = await query;
  // PGRST103: página fuera de rango (URL editada a mano) → lista vacía, no error.
  if (error && error.code !== "PGRST103") throw new Error("No se pudieron cargar los productos.");

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
                <SortableHead label="Código" sortKey="codigo" current={lp} basePath="/admin/productos" searchParams={sp} />
                <SortableHead label="Nombre" sortKey="nombre" current={lp} basePath="/admin/productos" searchParams={sp} />
                <SortableHead label="Garantía" sortKey="garantia" current={lp} basePath="/admin/productos" searchParams={sp} />
                <SortableHead label="Estado" sortKey="estado" current={lp} basePath="/admin/productos" searchParams={sp} />
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell data-label="Código" className="font-mono text-sm">{p.code}</TableCell>
                  <TableCell data-label="Nombre">
                    <div className="flex items-center gap-2.5">
                      {p.photo_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={productPhotoUrl(p.photo_path)}
                          alt=""
                          className="size-10 shrink-0 rounded-xl object-cover shadow-sm"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 dark:from-slate-800 dark:to-slate-900 dark:text-slate-500"
                        >
                          <Package className="size-5" />
                        </span>
                      )}
                      <Link href={`/admin/productos/${p.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell data-label="Garantía" className="text-sm text-muted-foreground">
                    {formatDuration(p.default_warranty_days)}
                  </TableCell>
                  <TableCell data-label="Estado">
                    <Badge variant={p.is_active ? "success" : "danger"}>
                      {p.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="" className="text-right">
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
      <Pagination page={lp.page} total={total ?? 0} basePath="/admin/productos" searchParams={sp} />
    </div>
  );
}
