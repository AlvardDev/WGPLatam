import type { Metadata } from "next";
import { ScanBarcode } from "lucide-react";
import { EmptyState } from "@/components/state/empty-state";

export const metadata: Metadata = { title: "Activar garantía" };

export default function ActivarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activar garantía</h1>
      </div>
      <EmptyState
        icon={ScanBarcode}
        title="Disponible en la Fase 5"
        description="Buscar por serial o código de barras, escanear y activar la garantía se implementa junto con productos, lotes y seriales."
      />
    </div>
  );
}
