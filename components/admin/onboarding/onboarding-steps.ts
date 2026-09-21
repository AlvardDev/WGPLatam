import type { LucideIcon } from "lucide-react";
import type { NavItem } from "@/components/layout/nav-items";

export type OnboardingStep = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  pageTarget?: { selector: string; description: string };
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

// Segundo señalamiento por paso, ya dentro de la página real (no el sidebar):
// el botón o zona concreta que enseña a usar ese módulo. Selector = el
// data-onboarding-target puesto a mano en el elemento real. Las pantallas de
// solo lectura (panel, ajustes) no necesitan uno — su descripción del
// sidebar ya basta.
const PAGE_TARGETS: Record<string, { selector: string; description: string }> = {
  "/admin/productos": {
    selector: '[data-onboarding-target="create-product"]',
    description: "Desde aquí agregas un producto nuevo al catálogo.",
  },
  "/admin/lotes": {
    selector: '[data-onboarding-target="create-lot"]',
    description: "Desde aquí creas un lote nuevo para agrupar los seriales de una producción o importación.",
  },
  "/admin/seriales": {
    selector: '[data-onboarding-target="create-serial"]',
    description: "Desde aquí registras un serial individual a mano, sin pasar por una importación.",
  },
  "/admin/importaciones": {
    selector: '[data-onboarding-target="new-import"]',
    description: "Desde aquí subes un archivo para cargar muchos seriales de una sola vez.",
  },
  "/admin/tiendas": {
    selector: '[data-onboarding-target="create-store"]',
    description: "Desde aquí das de alta una tienda nueva.",
  },
  "/admin/vendedores": {
    selector: '[data-onboarding-target="invite-seller"]',
    description: "Desde aquí invitas a un vendedor nuevo a una tienda.",
  },
  "/admin/garantias": {
    selector: '[data-onboarding-target="warranties-list"]',
    description: "Aquí ves cada garantía activada; entra a una para ver su comprobante y su historial.",
  },
  "/admin/reclamos": {
    selector: '[data-onboarding-target="claims-list"]',
    description: "Aquí ves cada reclamo; entra a uno para revisar el reporte técnico y resolverlo.",
  },
  "/admin/auditoria": {
    selector: '[data-onboarding-target="audit-list"]',
    description: "Aquí ves el registro completo de cambios: quién hizo qué y cuándo.",
  },
  "/admin/administradores": {
    selector: '[data-onboarding-target="invite-admin"]',
    description: "Desde aquí das de alta otra cuenta de administrador.",
  },
};

export function buildOnboardingSteps(navItems: NavItem[]): OnboardingStep[] {
  return navItems
    .filter((item) => item.href in SECTION_DESCRIPTIONS)
    .map((item) => ({
      href: item.href,
      title: item.label,
      description: SECTION_DESCRIPTIONS[item.href],
      icon: item.icon,
      pageTarget: PAGE_TARGETS[item.href],
    }));
}
