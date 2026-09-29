import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex animate-in flex-col items-center justify-center gap-4 rounded-2xl bg-card px-6 py-16 text-center shadow-soft fade-in zoom-in-[0.98] duration-300">
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-blue-100/60 blur-xl dark:bg-blue-500/10" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 ring-1 ring-blue-200/60 dark:from-blue-500/15 dark:to-blue-500/5 dark:text-blue-300 dark:ring-blue-400/20">
          <Icon className="size-7" />
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
