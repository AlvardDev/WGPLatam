import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Sin "centro de notificaciones" con estado propio (leído/no leído): son
// tres conteos en vivo, calculados en app/admin/layout.tsx — notificaciones
// de email fallidas (outbox de la Fase 6), seriales creados/importados sin
// código de barras que todavía hace falta completar, y solicitudes de
// autorización para activar sin barcode esperando decisión (2026-09-21).
export function NotificationBell({
  failedCount,
  missingBarcodeCount,
  pendingWaiverCount,
}: {
  failedCount: number;
  missingBarcodeCount: number;
  pendingWaiverCount: number;
}) {
  const total = failedCount + missingBarcodeCount + pendingWaiverCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
        aria-label={total > 0 ? `${total} novedades` : "Sin novedades"}
      >
        <Bell className="size-5" />
        {total > 0 ? (
          <span className="absolute top-1.5 right-1.5 block size-2 rounded-full bg-red-500" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {total === 0 ? (
          <DropdownMenuLabel className="font-normal text-muted-foreground">Sin novedades</DropdownMenuLabel>
        ) : (
          <DropdownMenuGroup>
            {pendingWaiverCount > 0 && (
              <DropdownMenuItem render={<Link href="/admin/seriales?barcode=pendiente" />}>
                {pendingWaiverCount} solicitud{pendingWaiverCount === 1 ? "" : "es"} de autorización pendiente
                {pendingWaiverCount === 1 ? "" : "s"}
              </DropdownMenuItem>
            )}
            {missingBarcodeCount > 0 && (
              <DropdownMenuItem render={<Link href="/admin/seriales?barcode=falta" />}>
                {missingBarcodeCount} serial{missingBarcodeCount === 1 ? "" : "es"} sin código de barras
              </DropdownMenuItem>
            )}
            {failedCount > 0 && (
              <DropdownMenuItem render={<Link href="/admin/ajustes" />}>
                {failedCount} notificación{failedCount === 1 ? "" : "es"} fallida{failedCount === 1 ? "" : "s"}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
