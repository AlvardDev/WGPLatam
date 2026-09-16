import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Puerta de autorización explícita para los pocos server actions que
 * necesitan lib/supabase/admin.ts (service role: ignora RLS por completo).
 * A diferencia del resto de la app —donde RLS es la autoridad y basta con
 * intentar la operación—, el cliente de service role no tiene ningún
 * control de Postgres que lo detenga, así que la verificación de rol tiene
 * que pasar aquí, en el servidor, antes de tocarlo. Ver docs/SECURITY.md,
 * "Reglas no negociables".
 *
 * Devuelve el id del admin autenticado (para auditar quién ejecuta la
 * acción) o null si quien llama no es un admin (o superadmin) activo —
 * superadmin hereda todo lo que puede hacer admin, nunca menos.
 */
export async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", sub)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin") || !profile.is_active) return null;
  return { id: sub };
}
