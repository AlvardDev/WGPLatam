import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
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
import { CreateProductDialog } from "./create-product-dialog";

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
    .select("id, code, name, default_warranty_days, is_active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data: products, error } = await query;
  if (error) throw new Error("No se pudieron cargar los productos.");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de productos y su política de garantía.
          </p>
        </div>
        <CreateProductDialog />
      </div>

      <form className="max-w-sm">
        <Input type="search" name="q" placeholder="Buscar por nombre o código..." defaultValue={q ?? ""} />
      </form>

      {!products || products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q ? "Sin resultados" : "Todavía no hay productos"}
          description={q ? `Nada coincide con "${q}".` : "Crea el primer producto para empezar."}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.code}</TableCell>
                  <TableCell>
                    <Link href={`/admin/productos/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.default_warranty_days} días
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "secondary" : "destructive"}>
                      {p.is_active ? "Activo" : "Inactivo"}
                    </Badge>
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
