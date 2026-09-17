import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { areaForPath, areaForRole, roleHomePath } from "@/lib/auth/role-path";

/**
 * proxy.ts es el nombre de este archivo en Next.js 16 (antes middleware.ts;
 * ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md,
 * "Migration to Proxy"). Solo hace UX: refresca la sesión, aplica la CSP y
 * redirige. La autorización real es RLS/RPC en Postgres (ver
 * docs/SECURITY.md) — un proxy mal configurado, una ruta olvidada del
 * matcher o una llamada directa a la API nunca debe poder saltarse eso.
 */
function cspHeader(): string {
  const isDev = process.env.NODE_ENV === "development";
  // Ver node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
  // ("Adding a nonce with Proxy"). script-src usa 'strict-dynamic': ningún
  // script inline sin nonce se ejecuta, ni siquiera uno inyectado por XSS.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const header = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`};
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self' https://*.supabase.co;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;
  return header.replace(/\s{2,}/g, " ").trim();
}

export async function proxy(request: NextRequest) {
  const csp = cspHeader();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  // Se reasigna dentro de setAll cuando Supabase refresca cookies; se
  // recrea siempre a partir de `requestHeaders` para no perder la CSP.
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() valida el JWT (no solo lee una cookie sin verificar). Ver
  // docs/ARCHITECTURE.md, "Auth y roles": nunca confiar en getSession() para
  // decisiones de autorización, ni siquiera a nivel de UX. Si Supabase no
  // responde (caída, mala configuración), se trata como no autenticado —
  // cierra en falso, nunca deja pasar una ruta protegida por error.
  let claims: NonNullable<Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"]>["claims"] | undefined;
  try {
    const { data } = await supabase.auth.getClaims();
    claims = data?.claims;
  } catch {
    claims = undefined;
  }
  const role = (claims?.app_metadata as { role?: "admin" | "seller" | "superadmin" } | undefined)?.role ?? null;

  // MFA obligatorio para admin y superadmin (Fase 8; docs/SECURITY.md,
  // "MFA"). Vendedores quedan fuera a propósito: es opcional para ellos en
  // el MVP. Igual que getClaims() arriba, si la llamada falla se trata como
  // "todavía en aal1" — cierra en falso, nunca deja pasar sin verificar.
  let requiresMfa = false;
  if (claims && (role === "admin" || role === "superadmin")) {
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      requiresMfa = !data || data.currentLevel !== "aal2";
    } catch {
      requiresMfa = true;
    }
  }

  const { pathname } = request.nextUrl;
  const area = areaForPath(pathname);
  const isMfaPage = pathname === "/mfa";
  // "/actualizar-clave" queda afuera a propósito: a diferencia de /login y
  // /recuperar, esa página necesita una sesión autenticada para funcionar
  // (supabase.auth.updateUser) — es el destino del enlace de recuperación,
  // no una página de la que haya que sacar a alguien ya logueado.
  // Coincidencia exacta, no startsWith: "/recuperar-vendedor" y "/registro"
  // son públicas mientras haya o no sesión, no deben rebotar a un
  // administrador ya logueado (startsWith("/recuperar") atrapaba también
  // "/recuperar-vendedor" por accidente).
  const isAuthPage = pathname.startsWith("/login") || pathname === "/recuperar";
  const isPendingPage = pathname === "/pendiente";

  const redirectWithCsp = (pathname: string, search?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    if (search) for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
    const redirectResponse = NextResponse.redirect(url);
    redirectResponse.headers.set("Content-Security-Policy", csp);
    return redirectResponse;
  };

  // Sesión real pero sin rol asignado todavía (auto-registro de vendedor
  // esperando aprobación — Fase 9, "seller_self_registration" — o el viejo
  // bootstrap manual sin metadata): RLS ya bloquea todo el acceso a datos,
  // esto solo evita dejarlo varado en /login o en un área protegida sin
  // explicación. Se resuelve antes que cualquier otra regla porque ninguna
  // de las siguientes tiene sentido para un rol nulo.
  if (claims && !role) {
    if (!isPendingPage) return redirectWithCsp("/pendiente");
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }
  if (isPendingPage) {
    return redirectWithCsp(claims ? roleHomePath(role) : "/login");
  }

  if ((area || isMfaPage) && !claims) {
    return redirectWithCsp("/login", { next: pathname });
  }

  if (isMfaPage && claims) {
    if (role !== "admin" && role !== "superadmin") return redirectWithCsp(roleHomePath(role));
    if (!requiresMfa) return redirectWithCsp("/admin");
  }

  if (area === "admin" && requiresMfa && !isMfaPage) {
    return redirectWithCsp("/mfa");
  }

  if (area && claims && areaForRole(role) !== area) {
    return redirectWithCsp(roleHomePath(role));
  }

  if (isAuthPage && claims && role) {
    return redirectWithCsp(requiresMfa ? "/mfa" : roleHomePath(role));
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Corre en todo excepto archivos estáticos y de imagen de Next, para no
     * bloquear CSS/JS/imágenes por accidente.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
