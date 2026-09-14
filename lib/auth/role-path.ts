export type AppRole = "admin" | "seller";

/**
 * A dónde redirigir tras un login exitoso, o al entrar a una ruta protegida
 * sin especificar sección. Función pura para poder testearla sin un
 * servidor real (ver lib/auth/role-path.test.ts).
 */
export function roleHomePath(role: AppRole | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "seller") return "/tienda";
  return "/login";
}

/** true si la ruta pertenece al área protegida de un rol específico. */
export function areaForPath(pathname: string): AppRole | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/tienda")) return "seller";
  return null;
}
