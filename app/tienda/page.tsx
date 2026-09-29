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
import { PageHeader } from "@/components/layout/page-header";
import { ExpiryCell } from "@/components/warranties/expiry-cell";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Inicio" };

// Sin paginación por keyset a propósito (mismo criterio que /admin/productos):
// el volumen de garantías de una tienda en el MVP no justifica esa
// complejidad todavía. RLS (warranties_seller_select) ya filtra a la
// tienda del vendedor — no hace falta repetir el filtro aquí.
export default async function TiendaPage() {
  const supabase = await createClient();
  const { data: warranties, error } = await supabase
    .from("warranties")
    .select("id, product_name, serial, customer_name, activated_at, expires_at, voided_at")
    .order("activated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("No se pudieron cargar las garantías.");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        description="Garantías activadas por tu tienda."
        actions={<Button render={<Link href="/tienda/activar">Activar garantía</Link>} />}
      />

      {!warranties || warranties.length === 0 ? (
        <EmptyState
          icon={ScanBarcode}
          title="Todavía no hay garantías activadas"
          description="Activa la primera buscando un serial o código de barras."
          action={<Button render={<Link href="/tienda/activar">Activar garantía</Link>} />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
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
                  <TableCell data-label="Producto">
                    <Link href={`/tienda/garantias/${w.id}`} className="row-link font-medium text-blue-700 dark:text-blue-300 underline-offset-4 hover:underline">
                      {w.product_name}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Serial" className="font-mono text-sm">{w.serial}</TableCell>
                  <TableCell data-label="Cliente" className="text-sm text-muted-foreground">{w.customer_name}</TableCell>
                  <TableCell data-label="Activada" className="text-sm text-muted-foreground">
                    <span title={formatDateTime(w.activated_at)}>{timeAgo(w.activated_at)}</span>
                  </TableCell>
                  <TableCell data-label="Vence" className="text-sm text-muted-foreground">
                    <ExpiryCell expiresAt={w.expires_at} voidedAt={w.voided_at} />
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
