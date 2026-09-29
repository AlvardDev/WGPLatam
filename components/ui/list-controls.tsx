import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { TableHead } from "@/components/ui/table";
import { PAGE_SIZE, withParams, type SearchParams } from "@/lib/list-params";

/** Encabezado de columna que ordena al hacer clic (asc ↔ desc), conservando los filtros. */
export function SortableHead({
  label,
  sortKey,
  current,
  basePath,
  searchParams,
  className,
}: {
  label: string;
  sortKey: string;
  current: { sortKey: string; asc: boolean };
  basePath: string;
  searchParams: SearchParams;
  className?: string;
}) {
  const active = current.sortKey === sortKey;
  const nextDir = active && current.asc ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : current.asc ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (current.asc ? "ascending" : "descending") : undefined}>
      <Link
        href={withParams(basePath, searchParams, { orden: sortKey, dir: nextDir, pagina: undefined })}
        className={cn(
          "group/sort inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-40 group-hover/sort:opacity-80")} />
      </Link>
    </TableHead>
  );
}

/** "Mostrando 26–50 de 120" + anterior/siguiente. No se muestra si todo cabe en una página. */
export function Pagination({
  page,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  total: number;
  basePath: string;
  searchParams: SearchParams;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const link = (p: number) => withParams(basePath, searchParams, { pagina: p > 1 ? String(p) : undefined });
  const btn =
    "inline-flex h-9 items-center gap-1 rounded-xl bg-muted/80 px-3 text-sm font-medium transition-[background-color,transform] hover:bg-muted active:scale-[0.97]";

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums">
        Mostrando <span className="font-medium text-foreground">{first.toLocaleString("es")}–{last.toLocaleString("es")}</span> de{" "}
        <span className="font-medium text-foreground">{total.toLocaleString("es")}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={link(page - 1)} className={btn}>
            <ChevronLeft className="size-4" /> Anterior
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-40")}>
            <ChevronLeft className="size-4" /> Anterior
          </span>
        )}
        <span className="px-1 text-muted-foreground tabular-nums">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={link(page + 1)} className={btn}>
            Siguiente <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-40")}>
            Siguiente <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
