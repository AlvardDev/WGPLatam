import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminActions } from "./admin-actions";

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">{admin.full_name}</h1>
          <Badge variant={admin.is_active ? "secondary" : "destructive"}>
            {admin.is_active ? "Activo" : "Desactivado"}
          </Badge>
        </div>
        <AdminActions id={admin.id} isActive={admin.is_active} />
      </div>

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
