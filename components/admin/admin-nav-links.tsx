"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem } from "@/components/layout/nav-items";

export function AdminNavLinks({
  items,
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  /** Sidebar colapsado: solo íconos, el nombre aparece en un tooltip. */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-onboarding-nav={item.href}
            aria-label={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group/nav relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color] duration-200",
              // Indicador: barrita a la izquierda que crece al activarse.
              "before:absolute before:top-1/2 before:left-0 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-blue-400 before:transition-transform before:duration-300",
              collapsed && "justify-center px-0",
              active
                ? "bg-white/10 text-white before:scale-y-100"
                : "text-slate-300 before:scale-y-0 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "size-[18px] shrink-0 transition-[color,transform] duration-200 group-hover/nav:scale-110",
                active ? "text-blue-300" : "text-slate-400 group-hover/nav:text-white",
              )}
            />
            {collapsed ? null : <span className="truncate">{item.label}</span>}
          </Link>
        );
        if (!collapsed) return link;
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger render={link} />
            <TooltipContent side="right" sideOffset={10}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
