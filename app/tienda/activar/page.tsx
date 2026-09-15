import type { Metadata } from "next";
import { ActivationFlow } from "./activation-flow";

export const metadata: Metadata = { title: "Activar garantía" };

export default function ActivarPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activar garantía</h1>
        <p className="text-sm text-muted-foreground">Busca el serial o código de barras del producto.</p>
      </div>
      <ActivationFlow />
    </div>
  );
}
