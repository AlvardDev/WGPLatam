"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { inviteSellerSchema, type InviteSellerInput } from "@/lib/validation/sellers";

// Efectivamente permanente (100 años) — Supabase Auth no tiene un "ban
// indefinido" real, solo una fecha límite muy lejana. Ver docs/PROJECT-PLAN.md:
// "al desactivar se banea al usuario en Auth para matar su refresh token".
const PERMANENT_BAN = "876000h";

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

function friendlySellerError(message: string): string {
  if (message.includes("already provisioned")) return "Este usuario ya tiene un rol asignado.";
  if (message.includes("store not found")) return "La tienda seleccionada no existe.";
  if (message.includes("store is not active")) return "La tienda seleccionada está inactiva.";
  if (message.includes("full name is required")) return "El nombre es obligatorio.";
  if (message.includes("profile not found")) return "El perfil no existe.";
  if (message.includes("target is not a seller")) return "Esa cuenta no es de un vendedor.";
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  return "No se pudo completar la operación.";
}

export async function inviteSeller(
  input: InviteSellerInput,
): Promise<{ error?: string; id?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para invitar vendedores." };

  const parsed = inviteSellerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { email, fullName, storeId } = parsed.data;

  const adminClient = createAdminClient();
  const redirectTo = `${await origin()}/auth/callback?next=/actualizar-clave`;

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });
  if (inviteError || !invited.user) {
    return { error: friendlySellerError(inviteError?.message ?? "") };
  }
  const userId = invited.user.id;

  // app_metadata (no "data" de arriba, que solo llega a user_metadata — ver
  // el comentario de la migración phase4_seller_rpc): fuente real que
  // proxy.ts lee del JWT para enrutar a /tienda en logins futuros.
  const { error: metadataError } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: "seller", store_id: storeId, full_name: fullName },
  });
  if (metadataError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    return { error: "No se pudo completar la invitación. Intenta de nuevo." };
  }

  const supabase = await createClient();
  const { error: finalizeError } = await supabase.rpc("admin_finalize_seller_profile", {
    p_user_id: userId,
    p_full_name: fullName,
    p_store_id: storeId,
  });
  if (finalizeError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    return { error: friendlySellerError(finalizeError.message) };
  }

  revalidatePath("/admin/vendedores");
  return { id: userId };
}

export async function setSellerActive(
  id: string,
  isActive: boolean,
): Promise<{ error?: string; success?: boolean; warning?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para hacer esto." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_seller_active", {
    p_user_id: id,
    p_is_active: isActive,
  });
  if (error) return { error: friendlySellerError(error.message) };

  // El acceso a datos ya quedó bloqueado por RLS (is_active en la tabla, se
  // evalúa en cada consulta). Esto es una segunda capa: mata el refresh
  // token para que ni siquiera pueda mantener la sesión ya abierta.
  const adminClient = createAdminClient();
  const { error: banError } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: isActive ? "none" : PERMANENT_BAN,
  });

  revalidatePath("/admin/vendedores");
  revalidatePath(`/admin/vendedores/${id}`);

  if (banError) {
    return {
      success: true,
      warning: isActive
        ? "El vendedor quedó activo en el sistema, pero no se pudo levantar el bloqueo de su sesión en Supabase Auth. Reintenta."
        : "El vendedor ya no tiene acceso a los datos, pero no se pudo revocar su sesión en Supabase Auth. Reintenta.",
    };
  }
  return { success: true };
}
