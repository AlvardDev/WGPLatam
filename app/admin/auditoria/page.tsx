import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
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
import Link from "next/link";
import { AuditDetailDialog } from "./audit-detail-dialog";

export const metadata: Metadata = { title: "Auditoría" };

const PAGE_SIZE = 50;

// Universo exacto de valores posibles: solo hay 2 fuentes de filas (ver
// supabase/migrations/20260914201420_audit_logs.sql) — el trigger genérico
// sobre las 4 tablas de catálogo (action = insert/update/delete) y
// log_audit_event (action = login/logout, entity_type = auth). No es una
// lista abierta que vaya a crecer sin tocar esta página.
const ACTIONS = ["insert", "update", "delete", "login", "logout"] as const;
const ENTITY_TYPES = ["stores", "profiles", "app_settings", "notification_settings", "auth"] as const;

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Registro append-only: no se puede editar ni borrar.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <select
          name="accion"
          defaultValue={accion ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todas las acciones</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          name="entidad"
          defaultValue={entidad ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todas las entidades</option>
          {ENTITY_TYPES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          name="rol"
          defaultValue={rol ?? ""}
          className="h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los actores</option>
          <option value="admin">Admin</option>
          <option value="seller">Vendedor</option>
          <option value="sistema">Sistema</option>
        </select>
        <div className="flex flex-col gap-1">
          <label htmlFor="desde" className="text-xs text-muted-foreground">
            Desde
          </label>
          <Input id="desde" type="date" name="desde" defaultValue={desde ?? ""} className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hasta" className="text-xs text-muted-foreground">
            Hasta
          </label>
          <Input id="hasta" type="date" name="hasta" defaultValue={hasta ?? ""} className="h-8" />
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
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
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
                      <Badge variant="secondary">{log.actor_role ?? "sistema"}</Badge>
                      {log.actor_id ? (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {actorNames.get(log.actor_id) ?? log.actor_id}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-medium">{log.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.entity_type}
                      {log.entity_id ? (
                        <span className="ml-1 font-mono text-xs">
                          ({log.entity_id.slice(0, 8)})
                        </span>
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
