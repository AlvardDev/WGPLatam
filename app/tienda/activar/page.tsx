import type { Metadata } from "next";
import { ActivationFlow } from "./activation-flow";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Activar garantía" };

export default function ActivarPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="Activar garantía" description="Escanea o escribe el código del producto y completa los datos del cliente." />
      <ActivationFlow />
    </div>
  );
}
