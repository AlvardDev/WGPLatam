import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con la clave de servicio (service role): ignora RLS
 * por completo. Se usa EXCLUSIVAMENTE para operaciones administrativas que
 * no puede hacer un usuario normal, como invitar vendedores (Fase 4).
 *
 * `import "server-only"` hace que el build falle si este módulo llega a
 * importarse desde código de cliente. No usar este cliente para nada que
 * un Server Component/Action con lib/supabase/server.ts pueda resolver ya
 * respetando RLS — el privilegio de más se usa lo mínimo posible.
 *
 * No se llama todavía en ningún route/action de la Fase 1: queda listo como
 * la pieza de infraestructura que Fase 4 (invitar vendedores) necesitará.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
