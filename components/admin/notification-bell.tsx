import { Bell } from "lucide-react";

// Sin panel desplegable propio todavía (no hay un "centro de notificaciones"
// para admin, solo el outbox de la Fase 6) — el punto rojo es el mismo dato
// real que ya mostraba el KPI "Notificaciones fallidas" del panel, no un
// contador inventado. Lleva a /admin/ajustes, donde ya vive esa
// configuración.
export function NotificationBell({ failedCount }: { failedCount: number }) {
  return (
    <a
      href="/admin/ajustes"
      className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={failedCount > 0 ? `${failedCount} notificaciones fallidas` : "Sin notificaciones fallidas"}
    >
      <Bell className="size-5" />
      {failedCount > 0 ? (
        <span className="absolute top-1.5 right-1.5 block size-2 rounded-full bg-red-500" />
      ) : null}
    </a>
  );
}
