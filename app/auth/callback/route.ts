import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino de los enlaces de email de Supabase Auth (recuperación de
 * contraseña, invitaciones en la Fase 4). Intercambia el "code" por una
 * sesión y redirige. Sin esto, "recuperar contraseña" no puede completarse
 * nunca — no es una funcionalidad de fase futura, es parte de la base de
 * Auth de la Fase 1.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
