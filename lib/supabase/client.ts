import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para Client Components. Usa únicamente la clave
 * publishable (pública) — RLS decide qué puede ver o hacer cada usuario.
 * Ver docs/ARCHITECTURE.md, "Variables de entorno".
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
