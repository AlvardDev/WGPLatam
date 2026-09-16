import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Segundo checkpoint además de proxy.ts: si por lo que sea alguien llega
 * hasta aquí sin ser admin activo, se redirige antes de renderizar nada.
 * La autoridad real sigue siendo RLS — este layout es solo UX (ver
 * docs/SECURITY.md, "Reglas no negociables": ocultar un botón no es
 * seguridad; aquí ni siquiera se llega a mostrar el botón).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", claims.claims.sub)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin") || !profile.is_active) {
    redirect("/login");
  }

  return (
    <AppShell role={profile.role as "admin" | "superadmin"} fullName={profile.full_name}>
      {children}
    </AppShell>
  );
}
