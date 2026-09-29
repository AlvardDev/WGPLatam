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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateStoreDialog } from "./create-store-dialog";
import { EditStoreDialog } from "./edit-store-dialog";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Tiendas" };

// Sin paginación por keyset a propósito, mismo criterio que /admin/productos:
// el número de tiendas físicas de un negocio real no justifica esa
// complejidad (ver app/admin/seriales/page.tsx para el caso que sí la usa).
export default async function TiendasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("stores")
    .select("id, code, name, address, phone, country_code, timezone, is_active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data: stores, error } = await query;
  if (error) throw new Error("No se pudieron cargar las tiendas.");

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
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Zona horaria</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/admin/tiendas/${s.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                        {s.name}
                      </Link>
                      <EditStoreDialog store={s} />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.country_code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.timezone}</TableCell>
                  <TableCell>
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
    </div>
  );
}
