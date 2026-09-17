"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  sellerRegisterSchema,
  sellerPasswordResetRequestSchema,
  resolvePasswordResetSchema,
  type SellerRegisterInput,
  type SellerPasswordResetRequestInput,
  type ResolvePasswordResetInput,
} from "@/lib/validation/registro";

function friendlyRegisterError(message: string): string {
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  return "No se pudo completar el registro. Intenta de nuevo.";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Auto-registro de vendedor (público, sin sesión). A diferencia de
 * inviteSeller (lib/actions/sellers.ts), acá el propio vendedor elige su
 * contraseña y nadie envía ningún correo: email_confirm: true evita el
 * correo de confirmación que Supabase mandaría por defecto (ver
 * docs/PROGRESS.md, "E2E real..."). private.handle_new_user() deja el
 * perfil en role=null/is_active=false (sin acceso a nada, RLS lo bloquea
 * todo) hasta que un admin lo apruebe desde /admin/vendedores/pendientes.
 * Throttle de 5 registros/hora por IP (check_registration_throttle) —
 * mitiga el riesgo de scripting de registros falsos anotado en
 * docs/SECURITY.md.
 */
export async function registerSeller(
  input: SellerRegisterInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = sellerRegisterSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { email, fullName, storeId, password } = parsed.data;

  const supabase = await createClient();
  const { error: throttleError } = await supabase.rpc("check_registration_throttle", {
    p_ip: await clientIp(),
  });
  if (throttleError) return { error: "Demasiados intentos de registro. Intenta más tarde." };

  const adminClient = createAdminClient();

  const { data: store } = await adminClient.from("stores").select("id, is_active").eq("id", storeId).single();
  if (!store) return { error: "La tienda seleccionada no existe." };
  if (!store.is_active) return { error: "La tienda seleccionada está inactiva." };

  const { error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, requested_role: "seller", requested_store_id: storeId },
  });
  if (error) return { error: friendlyRegisterError(error.message) };

  return { success: true };
}

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

type PendingSignup = {
  id: string;
  email: string;
  fullName: string;
  requestedStoreId: string | null;
  createdAt: string;
};

/** Lista de auto-registros esperando aprobación. Solo admin/superadmin. */
export async function listPendingSignups(): Promise<{ error?: string; data?: PendingSignup[] }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para ver esto." };

  const supabase = await createClient();
  const { data: profiles, error } = await supabase.from("profiles").select("id").is("role", null);
  if (error) return { error: "No se pudieron cargar los registros pendientes." };
  if (!profiles || profiles.length === 0) return { data: [] };

  const adminClient = createAdminClient();
  const users = await Promise.all(profiles.map((p) => adminClient.auth.admin.getUserById(p.id)));

  const data: PendingSignup[] = [];
  for (const { data: u } of users) {
    if (!u?.user) continue;
    const meta = u.user.user_metadata as { full_name?: string; requested_role?: string; requested_store_id?: string };
    if (meta?.requested_role !== "seller") continue;
    data.push({
      id: u.user.id,
      email: u.user.email ?? "",
      fullName: meta.full_name ?? u.user.email ?? "",
      requestedStoreId: meta.requested_store_id ?? null,
      createdAt: u.user.created_at,
    });
  }
  return { data };
}

/** Aprueba un auto-registro: reusa el mismo RPC que finaliza una invitación. */
export async function approveSignup(
  userId: string,
  fullName: string,
  storeId: string,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para hacer esto." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_finalize_seller_profile", {
    p_user_id: userId,
    p_full_name: fullName,
    p_store_id: storeId,
  });
  if (error) {
    if (error.message.includes("store not found")) return { error: "La tienda seleccionada no existe." };
    if (error.message.includes("store is not active")) return { error: "La tienda seleccionada está inactiva." };
    return { error: "No se pudo aprobar el registro." };
  }

  revalidatePath("/admin/vendedores/pendientes");
  revalidatePath("/admin/vendedores");
  return {};
}

/** Rechaza un auto-registro: borra el usuario de Auth (cascada a profiles). */
export async function rejectSignup(userId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para hacer esto." };

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return { error: "No se pudo rechazar el registro." };

  revalidatePath("/admin/vendedores/pendientes");
  return {};
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
