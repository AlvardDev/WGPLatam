import type { LucideIcon } from "lucide-react";
import type { NavItem } from "@/components/layout/nav-items";

export type OnboardingStep = {
  title: string;
  description: string;
  icon: LucideIcon;
};

// Una entrada por cada pantalla real del panel (adminNav/superadminNav) — si
// se agrega una sección de navegación nueva sin describirla aquí, el paso
// simplemente no aparece en el tour (mejor eso que un paso vacío).
const SECTION_DESCRIPTIONS: Record<string, string> = {
  "/admin": "Un vistazo rápido al estado del negocio: garantías activas, reclamos abiertos y alertas del sistema.",
  "/admin/productos": "El catálogo de productos que vende la empresa.",
  "/admin/lotes": "Cada lote agrupa los seriales de una misma producción o importación.",
  "/admin/seriales": "Cada unidad física individual: número de serie, código de barras y su estado.",
  "/admin/importaciones": "Carga masiva de seriales nuevos desde un archivo, con vista previa antes de confirmar.",
  "/admin/tiendas": "Las tiendas donde se activan garantías y se atienden reclamos.",
  "/admin/vendedores": "Las cuentas de los vendedores de cada tienda.",
  "/admin/garantias": "El historial de garantías activadas, con su comprobante en PDF.",
  "/admin/reclamos": "Reclamos de clientes en curso, con su reporte técnico y resolución.",
  "/admin/auditoria": "Registro de cada acción importante del sistema: quién, qué y cuándo.",
  "/admin/ajustes": "Datos de la empresa, notificaciones y este mismo tutorial, por si quieres repetirlo.",
  "/admin/administradores": "Gestión de otras cuentas de administrador del sistema.",
};

export function buildOnboardingSteps(navItems: NavItem[]): OnboardingStep[] {
  return navItems
    .filter((item) => item.href in SECTION_DESCRIPTIONS)
    .map((item) => ({
      title: item.label,
      description: SECTION_DESCRIPTIONS[item.href],
      icon: item.icon,
    }));
}
