import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";

export type Crumb = { label: string; href?: string };

/**
 * Encabezado único de todas las páginas: ruta (en detalles), título,
 * descripción, badge de estado y acciones a la derecha.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  badge,
  leading,
  actions,
  mono,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  badge?: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <header className="space-y-2">
      {breadcrumbs?.length ? (
        <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="size-3.5 opacity-60" /> : null}
              {c.href ? (
                <Link href={c.href} className="transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="max-w-60 truncate text-foreground/80">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1
                className={cn(
                  "text-2xl font-semibold tracking-tight text-blue-950 dark:text-white",
                  mono && "font-mono",
                )}
              >
                {title}
              </h1>
              {badge}
            </div>
            {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
