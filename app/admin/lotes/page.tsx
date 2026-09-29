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
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { formatDuration } from "@/lib/format";
import { listParams, type SearchParams } from "@/lib/list-params";
import { Pagination, SortableHead } from "@/components/ui/list-controls";

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
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const producto = typeof sp.producto === "string" ? sp.producto : undefined;
  const lp = listParams(sp, { reciente: "created_at", codigo: "code", garantia: "warranty_days", seriales: "imported_count", estado: "is_active" }, { key: "reciente", asc: false });
  const supabase = await createClient();

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name");
  if (productsError) throw new Error("No se pudieron cargar los productos.");

  let query = supabase
    .from("lots")
    .select("id, code, warranty_days, expected_count, imported_count, is_active, product_id, products(name, code)", { count: "exact" })
    .order(lp.column, { ascending: lp.asc })
    .range(lp.from, lp.to);
  if (producto) query = query.eq("product_id", producto);

  const { data: lots, count: total, error } = await query.returns<LotRow[]>();
  // PGRST103: página fuera de rango (URL editada a mano) → lista vacía, no error.
  if (error && error.code !== "PGRST103") throw new Error("No se pudieron cargar los lotes.");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lotes"
        description="Origen y garantía por defecto de los seriales."
        actions={<CreateLotDialog products={products ?? []} />}
      />

      <form className="flex max-w-sm items-center gap-2">
        <Select
          name="producto"
          aria-label="Producto"
          defaultValue={producto ?? ""}
          placeholder="Todos los productos"
          options={(products ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
        />
      </form>

      {!lots || lots.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Todavía no hay lotes"
          description="Crea un lote para poder cargar seriales bajo un producto."
          action={<CreateLotDialog products={products ?? []} />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Código" sortKey="codigo" current={lp} basePath="/admin/lotes" searchParams={sp} />
                <TableHead>Producto</TableHead>
                <SortableHead label="Garantía" sortKey="garantia" current={lp} basePath="/admin/lotes" searchParams={sp} />
                <SortableHead label="Seriales" sortKey="seriales" current={lp} basePath="/admin/lotes" searchParams={sp} />
                <SortableHead label="Estado" sortKey="estado" current={lp} basePath="/admin/lotes" searchParams={sp} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((l) => (
                <TableRow key={l.id}>
                  <TableCell data-label="Código">
                    <Link href={`/admin/lotes/${l.id}`} className="row-link font-mono text-sm font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                      {l.code}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Producto" className="text-sm">{l.products?.name}</TableCell>
                  <TableCell data-label="Garantía" className="text-sm text-muted-foreground">{formatDuration(l.warranty_days)}</TableCell>
                  <TableCell data-label="Seriales" className="text-sm text-muted-foreground">
                    {l.imported_count}
                    {l.expected_count ? ` / ${l.expected_count}` : ""}
                  </TableCell>
                  <TableCell data-label="Estado">
                    <Badge variant={l.is_active ? "success" : "danger"}>
                      {l.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={lp.page} total={total ?? 0} basePath="/admin/lotes" searchParams={sp} />
    </div>
  );
}
