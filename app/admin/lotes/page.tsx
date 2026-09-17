import type { Metadata } from "next";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateLotDialog } from "./create-lot-dialog";

export const metadata: Metadata = { title: "Lotes" };

// Sin tipos generados de Supabase (docs/PROGRESS.md, riesgo abierto), un
// embed de relación many-to-one se infiere como array — en runtime PostgREST
// sí devuelve un objeto único; se corrige el tipo con .returns(), no
// separando en más queries (evitaría un N+1 real en un listado).
type LotRow = {
  id: string;
  code: string;
  warranty_days: number;
  expected_count: number | null;
  imported_count: number;
  is_active: boolean;
  product_id: string;
  products: { name: string; code: string } | null;
};

export default async function LotesPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>;
}) {
  const { producto } = await searchParams;
  const supabase = await createClient();

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name");
  if (productsError) throw new Error("No se pudieron cargar los productos.");

  let query = supabase
    .from("lots")
    .select("id, code, warranty_days, expected_count, imported_count, is_active, product_id, products(name, code)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (producto) query = query.eq("product_id", producto);

  const { data: lots, error } = await query.returns<LotRow[]>();
  if (error) throw new Error("No se pudieron cargar los lotes.");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">Lotes</h1>
          <p className="text-sm text-muted-foreground">Origen y garantía por defecto de los seriales.</p>
        </div>
        <CreateLotDialog products={products ?? []} />
      </div>

      <form className="flex max-w-sm items-center gap-2">
        <select
          name="producto"
          defaultValue={producto ?? ""}
          className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los productos</option>
          {(products ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
      </form>

      {!lots || lots.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Todavía no hay lotes"
          description="Crea un lote para poder cargar seriales bajo un producto."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Seriales</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/admin/lotes/${l.id}`} className="font-mono text-sm font-medium hover:underline">
                      {l.code}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{l.products?.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.warranty_days} días</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.imported_count}
                    {l.expected_count ? ` / ${l.expected_count}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={l.is_active ? "secondary" : "destructive"}>
                      {l.is_active ? "Activo" : "Inactivo"}
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
