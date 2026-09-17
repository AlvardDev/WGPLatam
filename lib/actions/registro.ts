"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  sellerPasswordResetRequestSchema,
  resolvePasswordResetSchema,
  type SellerPasswordResetRequestInput,
  type ResolvePasswordResetInput,
} from "@/lib/validation/registro";

/**
 * Solicitud de restablecimiento de contraseña de un vendedor (público, sin
 * sesión — nunca revela si el correo existe). Llama al RPC público
 * request_seller_password_reset en vez de auth.resetPasswordForEmail: no
 * dispara ningún correo, solo deja constancia para que admin la resuelva a
 * mano en /admin/vendedores/pendientes (ver la migración
 * 20260918020000_seller_self_registration.sql).
 */
export async function requestSellerPasswordReset(
  input: SellerPasswordResetRequestInput,
): Promise<{ success: boolean }> {
  const parsed = sellerPasswordResetRequestSchema.safeParse(input);
  if (!parsed.success) return { success: true };

  const supabase = await createClient();
  await supabase.rpc("request_seller_password_reset", { p_email: parsed.data.email });
  return { success: true };
}

type PendingReset = {
  requestId: string;
  userId: string;
  email: string;
  fullName: string;
  storeName: string | null;
  requestedAt: string;
};

/** Lista de vendedores que pidieron restablecer su contraseña. Solo admin/superadmin. */
export async function listPasswordResetRequests(): Promise<{ error?: string; data?: PendingReset[] }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para ver esto." };

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("seller_password_reset_requests")
    .select("id, user_id, requested_at, profiles(full_name, stores(name, code))")
    .order("requested_at", { ascending: true })
    .returns<
      { id: string; user_id: string; requested_at: string; profiles: { full_name: string; stores: { name: string; code: string } | null } | null }[]
    >();
  if (error) return { error: "No se pudieron cargar las solicitudes." };
  if (!rows || rows.length === 0) return { data: [] };

  const adminClient = createAdminClient();
  const users = await Promise.all(rows.map((r) => adminClient.auth.admin.getUserById(r.user_id)));

  const data: PendingReset[] = rows.map((r, i) => ({
    requestId: r.id,
    userId: r.user_id,
    email: users[i].data?.user?.email ?? "",
    fullName: r.profiles?.full_name ?? "",
    storeName: r.profiles?.stores ? `${r.profiles.stores.name} (${r.profiles.stores.code})` : null,
    requestedAt: r.requested_at,
  }));
  return { data };
}

/**
 * Aplica la contraseña nueva (acordada por fuera con el vendedor, nunca
 * guardada en la base) y cierra la solicitud.
 */
export async function resolvePasswordReset(
  requestId: string,
  userId: string,
  input: ResolvePasswordResetInput,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para hacer esto." };

  const parsed = resolvePasswordResetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const adminClient = createAdminClient();
  const { error: passwordError } = await adminClient.auth.admin.updateUserById(userId, {
    password: parsed.data.password,
  });
  if (passwordError) return { error: "No se pudo aplicar la contraseña." };

  const supabase = await createClient();
  await supabase.rpc("admin_resolve_password_reset_request", { p_request_id: requestId });

  revalidatePath("/admin/vendedores/pendientes");
  return {};
}
