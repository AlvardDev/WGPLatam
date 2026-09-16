export type AppRole = "admin" | "seller" | "superadmin";

/**
 * A dónde redirigir tras un login exitoso, o al entrar a una ruta protegida
 * sin especificar sección. Función pura para poder testearla sin un
 * servidor real (ver lib/auth/role-path.test.ts). superadmin comparte el
 * área /admin con admin — es "admin y algo más", no una sección aparte.
 */
export function roleHomePath(role: AppRole | null | undefined): string {
  if (role === "admin" || role === "superadmin") return "/admin";
  if (role === "seller") return "/tienda";
  return "/login";
}

/** true si la ruta pertenece al área protegida de un rol específico. */
export function areaForPath(pathname: string): "admin" | "seller" | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/tienda")) return "seller";
  return null;
}

/** El área a la que pertenece un rol (superadmin -> "admin", igual que admin). */
export function areaForRole(role: AppRole | null | undefined): "admin" | "seller" | null {
  if (role === "admin" || role === "superadmin") return "admin";
  if (role === "seller") return "seller";
  return null;
}
