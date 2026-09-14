import { LayoutDashboard, ScanBarcode, ScrollText, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Deliberadamente corto: cada entrada nueva es una pantalla que ya funciona,
// no un placeholder de una fase futura. Ver docs/PROGRESS.md para lo que
// falta (tiendas, usuarios, productos, etc. llegan en fases posteriores).
export const adminNav: NavItem[] = [
  { href: "/admin", label: "Panel", icon: LayoutDashboard },
  { href: "/admin/auditoria", label: "Auditoría", icon: ScrollText },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings },
];

export const sellerNav: NavItem[] = [
  { href: "/tienda", label: "Inicio", icon: LayoutDashboard },
  { href: "/tienda/activar", label: "Activar garantía", icon: ScanBarcode },
];
