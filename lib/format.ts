import type { BadgeVariant } from "@/components/ui/badge";

const DAY_MS = 24 * 60 * 60 * 1000;
const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** "12 sep 2026" */
export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

/** "12 sep 2026, 14:30" */
export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "hace 5 min", "hace 2 h", "ayer", "hace 3 días"; pasada una semana, la
 * fecha corta. Pensado para listas y actividad (el título con la fecha
 * completa va en `title` para quien la necesite).
 */
export function timeAgo(value: string | Date, now: Date = new Date()) {
  const diff = new Date(value).getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "ahora";
  if (abs < 60 * 60_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < DAY_MS) return rtf.format(Math.round(diff / (60 * 60_000)), "hour");
  if (abs < 7 * DAY_MS) return rtf.format(Math.round(diff / DAY_MS), "day");
  return formatDate(value);
}

/** 365 → "1 año", 180 → "6 meses", 45 → "45 días". Solo redondea cuando es exacto o casi (±2 días por mes). */
export function formatDuration(days: number) {
  if (days >= 360 && days % 365 <= 5) {
    const years = Math.round(days / 365);
    return years === 1 ? "1 año" : `${years} años`;
  }
  if (days >= 28 && Math.abs(days - Math.round(days / 30) * 30) <= 2) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 mes" : `${months} meses`;
  }
  return days === 1 ? "1 día" : `${days} días`;
}

/** Estado de vencimiento de una garantía, con color: anulada, vencida, vence pronto (≤30 días) o vigente. */
export function expiryInfo(
  expiresAt: string,
  voidedAt: string | null,
  now: Date = new Date(),
): { label: string; variant: BadgeVariant } {
  if (voidedAt) return { label: "Anulada", variant: "neutral" };
  const days = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return { label: "Vencida", variant: "danger" };
  if (days <= 30) return { label: days === 1 ? "Vence mañana" : `Vence en ${days} días`, variant: "warning" };
  return { label: "Vigente", variant: "success" };
}

/** Iniciales para avatar: "María José Pérez" → "MP". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
