"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UserMenu } from "@/components/layout/user-menu";
import { adminNav, sellerNav, superadminNav, type NavItem } from "@/components/layout/nav-items";

const ROLE_LABEL = { admin: "Administrador", seller: "Vendedor", superadmin: "Superadmin" } as const;

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  role,
  fullName,
  storeName,
  children,
}: {
  role: "admin" | "seller" | "superadmin";
  fullName: string;
  storeName?: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = role === "superadmin" ? superadminNav : role === "admin" ? adminNav : sellerNav;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r bg-background md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <ShieldCheck className="size-5 text-primary" />
          <span className="font-semibold">Garantías</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks items={items} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b bg-background px-4">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Abrir menú">
                    <Menu className="size-5" />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="flex h-14 items-center gap-2 border-b px-4 text-base">
                  <ShieldCheck className="size-5 text-primary" />
                  Garantías
                </SheetTitle>
                <div className="p-3">
                  <NavLinks items={items} onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="min-w-0">
            {storeName ? (
              <p className="truncate text-sm text-muted-foreground">{storeName}</p>
            ) : null}
          </div>

          <UserMenu fullName={fullName} roleLabel={ROLE_LABEL[role]} />
        </header>

        <main className="flex-1 bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
