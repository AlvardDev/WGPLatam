import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/state/empty-state";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
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
import Link from "next/link";
import { AuditDetailDialog } from "./audit-detail-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";

export const metadata: Metadata = { title: "Auditoría" };

const PAGE_SIZE = 50;

// Dos fuentes de filas: el trigger private.audit_row_change (action =
// insert/update/delete, entity_type = nombre de la tabla) y log_audit_event
// (login/logout, entity_type = auth). Las tablas con trigger son las de
// ENTITY_LABEL (verificado en la base el 2026-09-29: 13 tablas). Si se agrega
// el trigger a otra tabla, sumarla acá o se verá su nombre técnico.
const ACTION_LABEL: Record<string, string> = {
  insert: "Creó",
  update: "Modificó",
  delete: "Eliminó",
  login: "Inició sesión",
  logout: "Cerró sesión",
};

const ACTION_VARIANT: Record<string, BadgeVariant> = {
  insert: "success",
  update: "info",
  delete: "danger",
  login: "neutral",
  logout: "neutral",
};

const ENTITY_LABEL: Record<string, string> = {
  auth: "Sesión",
  stores: "Tienda",
  profiles: "Usuario",
  products: "Producto",
  lots: "Lote",
  serials: "Serial",
  serial_imports: "Importación",
  serial_barcode_waivers: "Autorización sin código de barras",
  warranties: "Garantía",
  warranty_corrections: "Corrección de garantía",
  warranty_claims: "Reclamo",
  technical_reports: "Reporte técnico",
  app_settings: "Configuración general",
  notification_settings: "Configuración de notificaciones",
};

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  seller: "Vendedor",
};

// Nombre legible del registro afectado, sacado de la propia fila auditada
// (sin consultas extra): nombre, serial, código... en ese orden.
function recordName(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const key of ["full_name", "name", "customer_name", "serial", "code", "file_name"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

type AuditRow = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: unknown;
  new_data: unknown;
  metadata: unknown;
};

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    accion?: string;
    entidad?: string;
    rol?: string;
    desde?: string;
    hasta?: string;
    cursor?: string;
  }>;
}) {
  const { accion, entidad, rol, desde, hasta, cursor } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("id, occurred_at, actor_id, actor_role, action, entity_type, entity_id, old_data, new_data, metadata")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (accion) query = query.eq("action", accion);
  if (entidad) query = query.eq("entity_type", entidad);
  if (rol) query = rol === "sistema" ? query.is("actor_role", null) : query.eq("actor_role", rol);
  if (desde) query = query.gte("occurred_at", `${desde}T00:00:00`);
  if (hasta) query = query.lte("occurred_at", `${hasta}T23:59:59.999`);
  if (cursor) {
    const [cOccurredAt, cId] = cursor.split("|");
    if (cOccurredAt && cId) {
      query = query.or(`occurred_at.lt.${cOccurredAt},and(occurred_at.eq.${cOccurredAt},id.lt.${cId})`);
    }
  }

  const { data, error } = await query.returns<AuditRow[]>();
  if (error) throw new Error(`No se pudo cargar la auditoría: ${error.message}`);

  const hasMore = (data?.length ?? 0) > PAGE_SIZE;
  const logs = (data ?? []).slice(0, PAGE_SIZE);
  const last = logs[logs.length - 1];
  const nextCursor = hasMore && last ? `${last.occurred_at}|${last.id}` : null;

  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((id): id is string => !!id))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const actorNames = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  const nextParams = new URLSearchParams();
  if (accion) nextParams.set("accion", accion);
  if (entidad) nextParams.set("entidad", entidad);
  if (rol) nextParams.set("rol", rol);
  if (desde) nextParams.set("desde", desde);
  if (hasta) nextParams.set("hasta", hasta);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Historial de cambios y accesos. No se puede editar ni borrar."
      />

      <form className="flex flex-wrap items-end gap-3" data-onboarding-target="audit-list">
        <Select
          name="accion"
          aria-label="Acción"
          defaultValue={accion ?? ""}
          placeholder="Todas las acciones"
          options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))}
          className="w-44"
        />
        <Select
          name="entidad"
          aria-label="Módulo"
          defaultValue={entidad ?? ""}
          placeholder="Todos los módulos"
          options={Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label }))}
          className="w-56"
        />
        <Select
          name="rol"
          aria-label="Quién"
          defaultValue={rol ?? ""}
          placeholder="Todos los usuarios"
          options={[
            { value: "superadmin", label: "Superadmin" },
            { value: "admin", label: "Admin" },
            { value: "seller", label: "Vendedor" },
            { value: "sistema", label: "Sistema" },
          ]}
          className="w-44"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="desde" className="text-xs text-muted-foreground">
            Desde
          </label>
          <Input id="desde" type="date" name="desde" defaultValue={desde ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hasta" className="text-xs text-muted-foreground">
            Hasta
          </label>
          <Input id="hasta" type="date" name="hasta" defaultValue={hasta ?? ""} />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Sin eventos"
          description="Los inicios de sesión y los cambios administrativos aparecerán aquí, o ajusta los filtros."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(log.occurred_at).toLocaleString("es")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={log.actor_id ? (actorNames.get(log.actor_id) ?? "?") : "Sistema"}
                          size="sm"
                        />
                        <span className="font-medium">
                          {log.actor_id ? (actorNames.get(log.actor_id) ?? "—") : "Sistema"}
                        </span>
                        {log.actor_role ? (
                          <Badge variant="neutral">{ROLE_LABEL[log.actor_role] ?? log.actor_role}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[log.action] ?? "outline"}>
                        {ACTION_LABEL[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{ENTITY_LABEL[log.entity_type] ?? log.entity_type}</span>
                      {log.entity_type !== "auth" && recordName(log.new_data ?? log.old_data) ? (
                        <span className="text-muted-foreground"> · {recordName(log.new_data ?? log.old_data)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <AuditDetailDialog
                        oldData={log.old_data}
                        newData={log.new_data}
                        metadata={log.metadata}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {nextCursor && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                render={<Link href={`/admin/auditoria?${nextParams.toString()}`}>Siguiente</Link>}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
