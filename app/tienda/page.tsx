import type { Metadata } from "next";
import Link from "next/link";
import { ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/state/empty-state";

export const metadata: Metadata = { title: "Inicio" };

export default function TiendaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-sm text-muted-foreground">
          El listado de garantías de tu tienda llega en una fase próxima.
        </p>
      </div>
      <EmptyState
        icon={ScanBarcode}
        title="Todavía no hay garantías activadas"
        description="La activación de garantías por serial o código de barras llega en la Fase 5."
        action={
          <Button render={<Link href="/tienda/activar">Activar garantía</Link>} />
        }
      />
    </div>
  );
}
