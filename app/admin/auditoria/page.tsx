import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Auditoría" };

/**
 * Visor mínimo de solo lectura, sin filtros ni paginación (eso es el
 * "módulo avanzado de auditoría" de la Fase 8). Sirve para comprobar que la
 * auditoría append-only realmente funciona de punta a punta. RLS
 * (audit_logs_select_admin) es quien decide qué filas llegan aquí, no este
 * componente.
 */
export default async function AuditoriaPage() {
  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, occurred_at, actor_role, action, entity_type, entity_id")
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`No se pudo cargar la auditoría: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Últimos 50 eventos. Registro append-only: no se puede editar ni borrar.
        </p>
      </div>

      {!logs || logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Todavía no hay eventos"
          description="Los inicios de sesión y los cambios administrativos aparecerán aquí."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
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
                  </TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.entity_type}
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
