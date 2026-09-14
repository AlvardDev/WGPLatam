import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/state/empty-state";

export const metadata: Metadata = { title: "Panel" };

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">
          Fundación del sistema (Fase 1). El panel con indicadores de garantías, tiendas y
          reclamos llega en las siguientes fases.
        </p>
      </div>
      <EmptyState
        icon={LayoutDashboard}
        title="Todavía no hay datos de negocio"
        description="Productos, lotes, seriales y garantías se incorporan en las próximas fases. Mientras tanto puedes revisar Ajustes y Auditoría."
      />
    </div>
  );
}
