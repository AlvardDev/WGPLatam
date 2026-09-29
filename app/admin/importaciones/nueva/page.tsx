import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "./import-wizard";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Nueva importación" };

export default async function NuevaImportacionPage() {
  const supabase = await createClient();

  const { data: lots, error } = await supabase
    .from("lots")
    .select("id, code, products(name, code)")
    .eq("is_active", true)
    .order("code")
    .returns<{ id: string; code: string; products: { name: string; code: string } | null }[]>();
  if (error) throw new Error("No se pudieron cargar los lotes.");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Importaciones", href: "/admin/importaciones" }, { label: "Nueva" }]}
        title="Nueva importación"
        description="Carga masiva de seriales desde un archivo CSV o Excel, para un solo lote."
      />
      <ImportWizard lots={lots ?? []} />
    </div>
  );
}
