import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { RegistroForm } from "./registro-form";

export const metadata: Metadata = { title: "Registro de vendedor" };

// Página pública (sin sesión): el visitante todavía no tiene cuenta, así que
// la lista de tiendas activas se lee con el cliente de service role en vez
// de RLS (stores no tiene política de select para "anon" — ver
// docs/SECURITY.md, "mínimo privilegio": no se agregó esa política pública
// solo para esto).
export default async function RegistroPage() {
  const adminClient = createAdminClient();
  const { data: stores } = await adminClient
    .from("stores")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name");

  return <RegistroForm stores={stores ?? []} />;
}
