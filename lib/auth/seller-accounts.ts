import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export type SellerAccount = { email: string | null; lastSignInAt: string | null };

/**
 * Correo y último ingreso de los vendedores: viven en auth.users, no en
 * profiles, así que se leen con la service role — solo después de
 * requireAdmin() (ver docs/SECURITY.md). Sin admin devuelve un mapa vacío.
 */
export async function getSellerAccounts(ids: string[]): Promise<Map<string, SellerAccount>> {
  const out = new Map<string, SellerAccount>();
  if (ids.length === 0 || !(await requireAdmin())) return out;
  const wanted = new Set(ids);
  const admin = createAdminClient();
  // ponytail: recorre todos los usuarios de Auth (1000 por página); si algún día hay decenas de miles, pasar a un RPC que lea auth.users por id.
  for (let page = 1; out.size < wanted.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      if (wanted.has(u.id)) out.set(u.id, { email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null });
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/** Lo mismo para un solo vendedor (página de detalle). */
export async function getSellerAccount(id: string): Promise<SellerAccount | null> {
  if (!(await requireAdmin())) return null;
  const { data, error } = await createAdminClient().auth.admin.getUserById(id);
  if (error || !data.user) return null;
  return { email: data.user.email ?? null, lastSignInAt: data.user.last_sign_in_at ?? null };
}
