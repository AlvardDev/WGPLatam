"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SerialRow = {
  id: string;
  serial: string;
  barcode: string | null;
  status: string;
  created_at: string;
  products: { name: string } | null;
  lots: { code: string } | null;
  warranty: { duration_days: number; customer_name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Disponible",
  ACTIVATED: "Activo",
  BLOCKED: "Bloqueado",
  VOID: "Anulado",
};

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: "bg-slate-100 text-slate-600",
  ACTIVATED: "bg-emerald-100 text-emerald-700",
  BLOCKED: "bg-amber-100 text-amber-700",
  VOID: "bg-red-100 text-red-700",
};

function toCsv(rows: SerialRow[]) {
  const header = ["Serial", "Código de barras", "Producto", "Lote", "Estado", "Garantía (meses)", "Cliente", "Fecha registro"];
  const lines = rows.map((r) =>
    [
      r.serial,
      r.barcode ?? "",
      r.products?.name ?? "",
      r.lots?.code ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      r.warranty ? Math.round(r.warranty.duration_days / 30) : "",
      r.warranty?.customer_name ?? "",
      new Date(r.created_at).toISOString(),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

// Exporta lo cargado en esta página (hasta 50 filas) — no la tabla
// completa, que puede llegar a cientos de miles de filas (ver comentario de
// paginación en page.tsx). Si hay filas tildadas, exporta solo esas.
export function SerialesTable({ serials }: { serials: SerialRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = serials.length > 0 && selected.size === serials.length;

  const exportRows = useMemo(
    () => (selected.size > 0 ? serials.filter((s) => selected.has(s.id)) : serials),
    [serials, selected],
  );

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(serials.map((s) => s.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    const csv = toCsv(exportRows);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seriales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleExport}>
          <Download className="size-4" />
          Exportar {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todos"
                  className="size-4 rounded border-input"
                />
              </TableHead>
              <TableHead>Serial</TableHead>
              <TableHead>Código de barras</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Garantía</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha registro</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serials.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                    aria-label={`Seleccionar ${s.serial}`}
                    className="size-4 rounded border-input"
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/admin/seriales/${s.id}`} className="font-mono text-sm font-medium hover:underline">
                    {s.serial}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{s.barcode ?? "—"}</TableCell>
                <TableCell className="text-sm">{s.products?.name}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{s.lots?.code}</TableCell>
                <TableCell>
                  <Badge className={STATUS_BADGE[s.status] ?? ""} variant="outline">
                    {STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.warranty ? `${Math.round(s.warranty.duration_days / 30)} meses` : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.warranty?.customer_name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString("es")}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" render={<Link href={`/admin/seriales/${s.id}`} aria-label="Ver detalle" />}>
                    <Eye className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
