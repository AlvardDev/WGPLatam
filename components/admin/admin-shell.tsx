"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";
import { AdminSearchBar } from "@/components/admin/admin-search-bar";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import { NotificationBell } from "@/components/admin/notification-bell";
import { OnboardingProvider } from "@/components/admin/onboarding/onboarding-tour";
import { adminNav, superadminNav } from "@/components/layout/nav-items";

const ROLE_LABEL = { admin: "Master", superadmin: "Superadmin" } as const;
const APP_VERSION = "v0.1.0";

function SidebarBrand() {
  return (
    <div className="flex h-16 items-center gap-2 px-5">
      <Image src="/wgp-logo.png" alt="WGP" width={1572} height={1001} className="h-6 w-auto" priority />
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="flex items-center gap-2 border-t border-white/10 px-5 py-4">
      <ShieldCheck className="size-5 shrink-0 text-blue-400" />
      <div className="leading-tight">
        <p className="text-xs font-medium text-slate-200">Sistema de Garantías</p>
        <p className="text-xs text-slate-400">WGP {APP_VERSION}</p>
      </div>
    </div>
  );
}

export function AdminShell({
  role,
  fullName,
  failedNotifications,
  missingBarcodeSerials,
  pendingBarcodeWaivers,
  showOnboarding,
  children,
}: {
  role: "admin" | "superadmin";
  fullName: string;
  failedNotifications: number;
  missingBarcodeSerials: number;
  pendingBarcodeWaivers: number;
  showOnboarding: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = role === "superadmin" ? superadminNav : adminNav;

  return (
    <OnboardingProvider role={role} autoShow={showOnboarding}>
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-[#04070f] via-[#0a1128] to-[#0f2050] md:sticky md:top-0 md:flex md:h-screen">
          <SidebarBrand />
          <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-2">
            <AdminNavLinks items={items} />
          </div>
          <SidebarFooter />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-3 border-b bg-background px-4 md:px-6">
            <div className="md:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger
                  render={
                    <Button variant="ghost" size="icon" aria-label="Abrir menú">
                      <Menu className="size-5" />
                    </Button>
                  }
                />
                <SheetContent
                  side="left"
                  className="w-64 gap-0 border-none bg-gradient-to-b from-[#04070f] via-[#0a1128] to-[#0f2050] p-0 text-white"
                >
                  <SheetTitle className="sr-only">Menú</SheetTitle>
                  <SidebarBrand />
                  <div className="flex-1 overflow-y-auto px-3 py-2">
                    <AdminNavLinks items={items} onNavigate={() => setMobileOpen(false)} />
                  </div>
                  <SidebarFooter />
                </SheetContent>
              </Sheet>
            </div>

            <div className="hidden flex-1 md:block">
              <AdminSearchBar />
            </div>

            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <NotificationBell
                failedCount={failedNotifications}
                missingBarcodeCount={missingBarcodeSerials}
                pendingWaiverCount={pendingBarcodeWaivers}
              />
              <AdminUserMenu fullName={fullName} roleLabel={ROLE_LABEL[role]} />
            </div>
          </header>

          <div className="border-b bg-background px-4 pb-3 md:hidden">
            <AdminSearchBar />
          </div>

          <main className="flex-1 bg-slate-50 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </OnboardingProvider>
  );
}
