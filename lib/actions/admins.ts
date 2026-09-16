"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/auth/require-superadmin";
import { inviteAdminSchema, type InviteAdminInput } from "@/lib/validation/admins";

// Mismo patrón que lib/actions/sellers.ts (Fase 4), con superadmin en vez de
// admin como quien invita, y sin store_id.
const PERMANENT_BAN = "876000h";

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

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

export async function inviteAdmin(
  input: InviteAdminInput,
): Promise<{ error?: string; id?: string }> {
  const superadmin = await requireSuperadmin();
  if (!superadmin) return { error: "No tienes permiso para invitar administradores." };

  const parsed = inviteAdminSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { email, fullName } = parsed.data;

  const adminClient = createAdminClient();
  const redirectTo = `${await origin()}/auth/callback?next=/actualizar-clave`;

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });
  if (inviteError || !invited.user) {
    return { error: friendlyAdminError(inviteError?.message ?? "") };
  }
  const userId = invited.user.id;

  const { error: metadataError } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin", full_name: fullName },
  });
  if (metadataError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    return { error: "No se pudo completar la invitación. Intenta de nuevo." };
  }

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
