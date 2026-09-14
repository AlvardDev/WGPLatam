import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Usa la clave publishable + las cookies de sesión del usuario:
 * RLS aplica igual que en el navegador. Esto NO es un cliente privilegiado
 * — para eso está lib/supabase/admin.ts.
 *
 * `cookies()` es async en esta versión de Next.js (ver
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Se llamó desde un Server Component, no desde una Server
            // Action/Route Handler: no se pueden escribir cookies aquí.
            // proxy.ts se encarga de refrescar la sesión en cada request.
          }
        },
      },
    },
  );
}
