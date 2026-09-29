import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminActions } from "./admin-actions";
import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";

export const metadata: Metadata = { title: "Administrador" };

type AdminDetail = { id: string; full_name: string; is_active: boolean; created_at: string };

export default async function AdministradorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const { data: self } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims?.claims?.sub ?? "")
    .single();
  if (self?.role !== "superadmin") notFound();

  const { data: admin, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active, created_at")
    .eq("id", id)
    .eq("role", "admin")
    .single<AdminDetail>();

  if (error || !admin) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Administradores", href: "/admin/administradores" }, { label: admin.full_name }]}
        leading={<UserAvatar name={admin.full_name} size="lg" />}
        title={admin.full_name}
        badge={
          <Badge variant={admin.is_active ? "success" : "danger"}>
            {admin.is_active ? "Activo" : "Desactivado"}
          </Badge>
        }
        actions={<AdminActions id={admin.id} isActive={admin.is_active} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos de la cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Creado el: </span>
            {new Date(admin.created_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
