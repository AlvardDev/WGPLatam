import type { Metadata } from "next";
import Link from "next/link";
import { ScanBarcode } from "lucide-react";
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
import { CreateSerialDialog } from "./create-serial-dialog";

export const metadata: Metadata = { title: "Seriales" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  AVAILABLE: "secondary",
  ACTIVATED: "outline",
  BLOCKED: "destructive",
  VOID: "destructive",
};

const PAGE_SIZE = 50;

// Ver nota de tipos en app/admin/lotes/page.tsx.
type SerialRow = {
  id: string;
  serial: string;
  barcode: string;
  status: string;
  status_reason: string | null;
  created_at: string;
  product_id: string;
  lot_id: string;
  products: { name: string; code: string } | null;
  lots: { code: string } | null;
};

// Paginación por keyset (created_at desc, id desc), no por offset: es la
// única tabla de la Fase 2 que de verdad puede llegar a cientos de miles de
// filas (ver docs/PHASE-2-REVIEW.md, §9). Solo "Siguiente" (forward-only) —
// suficiente para un listado administrativo, evita la complejidad de un
// conteo total / paginación bidireccional que nadie va a usar a esa escala.
export default async function SerialesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    producto?: string;
    lote?: string;
    status?: string;
    cursor?: string;
  }>;
}) {
  const { q, producto, lote, status, cursor } = await searchParams;
  const supabase = await createClient();

  const [{ data: products }, { data: lots }] = await Promise.all([
    supabase.from("products").select("id, code, name").eq("is_active", true).order("name"),
    supabase.from("lots").select("id, code, product_id").eq("is_active", true).order("code"),
  ]);

  let query = supabase
    .from("serials")
    .select(
      "id, serial, barcode, status, status_reason, created_at, product_id, lot_id, products(name, code), lots!serials_lot_id_fkey(code)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (q) {
    const normalized = q.trim().toUpperCase();
    query = query.or(`serial.eq.${normalized},barcode.eq.${normalized}`);
  }
  if (producto) query = query.eq("product_id", producto);
  if (lote) query = query.eq("lot_id", lote);
  if (status) query = query.eq("status", status);
  if (cursor) {
    const [cCreatedAt, cId] = cursor.split("|");
    if (cCreatedAt && cId) {
      query = query.or(`created_at.lt.${cCreatedAt},and(created_at.eq.${cCreatedAt},id.lt.${cId})`);
    }
  }

  const { data, error } = await query.returns<SerialRow[]>();
  if (error) throw new Error("No se pudieron cargar los seriales.");

  const hasMore = (data?.length ?? 0) > PAGE_SIZE;
  const serials = (data ?? []).slice(0, PAGE_SIZE);
  const last = serials[serials.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;

  const nextParams = new URLSearchParams();
  if (q) nextParams.set("q", q);
  if (producto) nextParams.set("producto", producto);
  if (lote) nextParams.set("lote", lote);
  if (status) nextParams.set("status", status);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Seriales</h1>
          <p className="text-sm text-muted-foreground">Inventario individual por número de serie.</p>
        </div>
        <CreateSerialDialog products={products ?? []} lots={lots ?? []} />
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Input type="search" name="q" placeholder="Serial o código de barras exacto..." defaultValue={q ?? ""} />
        </div>
        <select
          name="producto"
          defaultValue={producto ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los productos</option>
          {(products ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los estados</option>
          <option value="AVAILABLE">Disponible</option>
          <option value="ACTIVATED">Activado</option>
          <option value="BLOCKED">Bloqueado</option>
          <option value="VOID">Anulado</option>
        </select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {serials.length === 0 ? (
        <EmptyState
          icon={ScanBarcode}
          title="Sin seriales"
          description="Crea un serial dentro de un lote activo, o ajusta los filtros."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Código de barras</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serials.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/admin/seriales/${s.id}`} className="font-mono text-sm font-medium hover:underline">
                        {s.serial}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{s.barcode}</TableCell>
                    <TableCell className="text-sm">{s.products?.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{s.lots?.code}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status] ?? "outline"}>{s.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {nextCursor && (
            <div className="flex justify-end">
              <Button variant="outline" render={<Link href={`/admin/seriales?${nextParams.toString()}`}>Siguiente</Link>} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
