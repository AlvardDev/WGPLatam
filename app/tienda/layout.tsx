import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active, store_id")
    .eq("id", claims.claims.sub)
    .single();

  if (!profile || profile.role !== "seller" || !profile.is_active || !profile.store_id) {
    redirect("/login");
  }

  const { data: store } = await supabase
    .from("stores")
    .select("name, is_active")
    .eq("id", profile.store_id)
    .single();

  if (!store || !store.is_active) {
    redirect("/login");
  }

  return (
    <AppShell role="seller" fullName={profile.full_name} storeName={store.name}>
      {children}
    </AppShell>
  );
}
