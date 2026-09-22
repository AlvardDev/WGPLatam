import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";

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
    .select("full_name, role, is_active, onboarding_completed_at")
    .eq("id", claims.claims.sub)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin") || !profile.is_active) {
    redirect("/login");
  }

  const { count: failedNotifications } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "FAILED");

  const { count: missingBarcodeSerials } = await supabase
    .from("serials")
    .select("id", { count: "exact", head: true })
    .is("barcode", null)
    .eq("status", "AVAILABLE");

  const { count: pendingBarcodeWaivers } = await supabase
    .from("serial_barcode_waivers")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  return (
    <AdminShell
      role={profile.role as "admin" | "superadmin"}
      fullName={profile.full_name}
      failedNotifications={failedNotifications ?? 0}
      missingBarcodeSerials={missingBarcodeSerials ?? 0}
      pendingBarcodeWaivers={pendingBarcodeWaivers ?? 0}
      showOnboarding={!profile.onboarding_completed_at}
    >
      {children}
    </AdminShell>
  );
}
