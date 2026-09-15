import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Garantías" };

// Visor mínimo de solo lectura, igual que /admin/auditoria: consultar
// garantías globalmente es una capacidad de admin ya documentada desde la
// Fase 1 (docs/ARCHITECTURE.md); un panel con filtros/estado derivado
// (activa/por vencer/vencida) no es parte del alcance pedido para esta
// fase — lo mínimo aquí es suficiente para verificar que la activación
// funciona de punta a punta.
type WarrantyRow = {
  id: string;
  product_name: string;
  serial: string;
  customer_name: string;
  activated_at: string;
  expires_at: string;
  stores: { name: string; code: string } | null;
};

export default async function GarantiasPage() {
  const supabase = await createClient();
  const { data: warranties, error } = await supabase
    .from("warranties")
    .select("id, product_name, serial, customer_name, activated_at, expires_at, stores(name, code)")
    .order("activated_at", { ascending: false })
    .limit(100)
    .returns<WarrantyRow[]>();

  if (error) throw new Error("No se pudieron cargar las garantías.");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Garantías</h1>
        <p className="text-sm text-muted-foreground">Últimas 100 activaciones, de todas las tiendas.</p>
      </div>

      {!warranties || warranties.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Todavía no hay garantías activadas" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Activada</TableHead>
                <TableHead>Vence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warranties.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link href={`/admin/garantias/${w.id}`} className="font-medium hover:underline">
                      {w.product_name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{w.serial}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {w.stores ? `${w.stores.name} (${w.stores.code})` : "—"}
                  </TableCell>
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
