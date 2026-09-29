import { Badge } from "@/components/ui/badge";
import { expiryInfo, formatDate } from "@/lib/format";

/** Fecha de vencimiento + su estado con color (vigente / vence en N días / vencida / anulada). */
export function ExpiryCell({ expiresAt, voidedAt }: { expiresAt: string; voidedAt: string | null }) {
  const info = expiryInfo(expiresAt, voidedAt);
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={info.variant}>{info.label}</Badge>
      <span className="text-xs text-muted-foreground">{formatDate(expiresAt)}</span>
    </div>
  );
}
