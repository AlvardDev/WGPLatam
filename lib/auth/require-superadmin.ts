import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Igual que require-admin.ts pero exige específicamente role='superadmin'
 * — para las acciones que gestionan otras cuentas admin (invitar,
 * desactivar/reactivar). Un admin normal no puede tocar otras cuentas admin.
 */
export async function requireSuperadmin(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", sub)
    .single();

  if (!profile || profile.role !== "superadmin" || !profile.is_active) return null;
  return { id: sub };
}
