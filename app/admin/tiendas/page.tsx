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
    .select("id, code, name, country_code, timezone, is_active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data: stores, error } = await query;
  if (error) throw new Error("No se pudieron cargar las tiendas.");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tiendas</h1>
          <p className="text-sm text-muted-foreground">Ubicaciones donde se activan garantías.</p>
        </div>
        <CreateStoreDialog />
      </div>

      <form className="max-w-sm">
        <Input type="search" name="q" placeholder="Buscar por nombre o código..." defaultValue={q ?? ""} />
      </form>

      {!stores || stores.length === 0 ? (
        <EmptyState
          icon={Store}
          title={q ? "Sin resultados" : "Todavía no hay tiendas"}
          description={q ? `Nada coincide con "${q}".` : "Crea la primera tienda para poder invitar vendedores."}
        />
      ) : (
        <div className="rounded-lg border">
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
                    <Link href={`/admin/tiendas/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.country_code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.timezone}</TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "secondary" : "destructive"}>
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
