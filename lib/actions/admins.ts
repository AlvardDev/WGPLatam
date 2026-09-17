"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/auth/require-superadmin";
import { createAdminSchema, type CreateAdminInput } from "@/lib/validation/admins";

// Mismo patrón que lib/actions/sellers.ts (Fase 4), con superadmin en vez de
// admin como quien da de alta, y sin store_id.
const PERMANENT_BAN = "876000h";

function friendlyAdminError(message: string): string {
  if (message.includes("already provisioned")) return "Este usuario ya tiene un rol asignado.";
  if (message.includes("full name is required")) return "El nombre es obligatorio.";
  if (message.includes("profile not found")) return "El perfil no existe.";
  if (message.includes("target is not an admin")) return "Esa cuenta no es de un admin.";
  if (message.includes("only superadmin")) return "No tienes permiso para hacer esto.";
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  return "No se pudo completar la operación.";
}

/**
 * Crea la cuenta admin con la contraseña que eligió el superadmin — sin
 * correo de invitación (bloqueado por el límite de 2/hora del SMTP de
 * Supabase sin dominio propio). El superadmin comunica correo/contraseña
 * al admin por fuera, igual que resolvePasswordReset en
 * /admin/vendedores/pendientes.
 */
export async function createAdmin(
  input: CreateAdminInput,
): Promise<{ error?: string; id?: string }> {
  const superadmin = await requireSuperadmin();
  if (!superadmin) return { error: "No tienes permiso para crear administradores." };

  const parsed = createAdminSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { email, fullName, password } = parsed.data;

  const adminClient = createAdminClient();
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin", full_name: fullName },
  });
  if (createError || !created.user) {
    return { error: friendlyAdminError(createError?.message ?? "") };
  }
  const userId = created.user.id;

  const supabase = await createClient();
  const { error: finalizeError } = await supabase.rpc("admin_finalize_admin_profile", {
    p_user_id: userId,
    p_full_name: fullName,
  });
  if (finalizeError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    return { error: friendlyAdminError(finalizeError.message) };
  }

  revalidatePath("/admin/administradores");
  return { id: userId };
}

export async function setAdminActive(
  id: string,
  isActive: boolean,
): Promise<{ error?: string; success?: boolean; warning?: string }> {
  const superadmin = await requireSuperadmin();
  if (!superadmin) return { error: "No tienes permiso para hacer esto." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_admin_active", {
    p_user_id: id,
    p_is_active: isActive,
  });
  if (error) return { error: friendlyAdminError(error.message) };

  const adminClient = createAdminClient();
  const { error: banError } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: isActive ? "none" : PERMANENT_BAN,
  });

  revalidatePath("/admin/administradores");
  revalidatePath(`/admin/administradores/${id}`);

  if (banError) {
    return {
      success: true,
      warning: isActive
        ? "El admin quedó activo en el sistema, pero no se pudo levantar el bloqueo de su sesión en Supabase Auth. Reintenta."
        : "El admin ya no tiene acceso a los datos, pero no se pudo revocar su sesión en Supabase Auth. Reintenta.",
    };
  }
  return { success: true };
}
