import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateStoreDialog } from "./create-store-dialog";
import { EditStoreDialog } from "./edit-store-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { listParams, type SearchParams } from "@/lib/list-params";
import { Pagination, SortableHead } from "@/components/ui/list-controls";

export const metadata: Metadata = { title: "Tiendas" };

// Sin paginación por keyset a propósito, mismo criterio que /admin/productos:
// el número de tiendas físicas de un negocio real no justifica esa
// complejidad (ver app/admin/seriales/page.tsx para el caso que sí la usa).
export default async function TiendasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const lp = listParams(sp, { reciente: "created_at", codigo: "code", nombre: "name", pais: "country_code", zona: "timezone", estado: "is_active" }, { key: "reciente", asc: false });
  const supabase = await createClient();

  let query = supabase
    .from("stores")
    .select("id, code, name, address, phone, country_code, timezone, is_active", { count: "exact" })
    .order(lp.column, { ascending: lp.asc })
    .range(lp.from, lp.to);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data: stores, count: total, error } = await query;
  // PGRST103: página fuera de rango (URL editada a mano) → lista vacía, no error.
  if (error && error.code !== "PGRST103") throw new Error("No se pudieron cargar las tiendas.");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tiendas"
        description="Ubicaciones donde se activan garantías."
        actions={<CreateStoreDialog />}
      />

      <form className="max-w-sm">
        <Input type="search" name="q" placeholder="Buscar por nombre o código..." defaultValue={q ?? ""} />
      </form>

      {!stores || stores.length === 0 ? (
        <EmptyState
          icon={Store}
          title={q ? "Sin resultados" : "Todavía no hay tiendas"}
          description={q ? `Nada coincide con "${q}".` : "Crea la primera tienda para poder invitar vendedores."}
          action={!q ? <CreateStoreDialog /> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Código" sortKey="codigo" current={lp} basePath="/admin/tiendas" searchParams={sp} />
                <SortableHead label="Nombre" sortKey="nombre" current={lp} basePath="/admin/tiendas" searchParams={sp} />
                <SortableHead label="País" sortKey="pais" current={lp} basePath="/admin/tiendas" searchParams={sp} />
                <SortableHead label="Zona horaria" sortKey="zona" current={lp} basePath="/admin/tiendas" searchParams={sp} />
                <SortableHead label="Estado" sortKey="estado" current={lp} basePath="/admin/tiendas" searchParams={sp} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell data-label="Código" className="font-mono text-sm">{s.code}</TableCell>
                  <TableCell data-label="Nombre">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/admin/tiendas/${s.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                        {s.name}
                      </Link>
                      <EditStoreDialog store={s} />
                    </div>
                  </TableCell>
                  <TableCell data-label="País" className="text-sm text-muted-foreground">{s.country_code}</TableCell>
                  <TableCell data-label="Zona horaria" className="text-sm text-muted-foreground">{s.timezone}</TableCell>
                  <TableCell data-label="Estado">
                    <Badge variant={s.is_active ? "success" : "danger"}>
                      {s.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={lp.page} total={total ?? 0} basePath="/admin/tiendas" searchParams={sp} />
    </div>
  );
}
