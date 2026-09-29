import type { Metadata } from "next";
import Link from "next/link";
import { ScanBarcode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/state/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Inicio" };

// Sin paginación por keyset a propósito (mismo criterio que /admin/productos):
// el volumen de garantías de una tienda en el MVP no justifica esa
// complejidad todavía. RLS (warranties_seller_select) ya filtra a la
// tienda del vendedor — no hace falta repetir el filtro aquí.
export default async function TiendaPage() {
  const supabase = await createClient();
  const { data: warranties, error } = await supabase
    .from("warranties")
    .select("id, product_name, serial, customer_name, activated_at, expires_at")
    .order("activated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("No se pudieron cargar las garantías.");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="text-sm text-muted-foreground">Garantías activadas por tu tienda.</p>
        </div>
        <Button render={<Link href="/tienda/activar">Activar garantía</Link>} />
      </div>

      {!warranties || warranties.length === 0 ? (
        <EmptyState
          icon={ScanBarcode}
          title="Todavía no hay garantías activadas"
          description="Activa la primera buscando un serial o código de barras."
          action={<Button render={<Link href="/tienda/activar">Activar garantía</Link>} />}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Activada</TableHead>
                <TableHead>Vence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warranties.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link href={`/tienda/garantias/${w.id}`} className="font-medium text-blue-700 underline-offset-4 hover:underline">
                      {w.product_name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{w.serial}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{w.customer_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(w.activated_at).toLocaleDateString("es")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(w.expires_at).toLocaleDateString("es")}
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
