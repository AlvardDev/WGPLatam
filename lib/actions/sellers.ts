"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createSellerSchema,
  updateSellerSchema,
  type CreateSellerInput,
  type UpdateSellerInput,
} from "@/lib/validation/sellers";
import { resolvePasswordResetSchema, type ResolvePasswordResetInput } from "@/lib/validation/registro";

// Efectivamente permanente (100 años) — Supabase Auth no tiene un "ban
// indefinido" real, solo una fecha límite muy lejana. Ver docs/PROJECT-PLAN.md:
// "al desactivar se banea al usuario en Auth para matar su refresh token".
const PERMANENT_BAN = "876000h";

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

/**
 * Crea la cuenta del vendedor con el correo y la contraseña que elige el
 * admin — sin correo de invitación de por medio (Supabase Auth solo permite
 * 2 correos/hora sin SMTP propio, ver docs/PROGRESS.md). El admin le entrega
 * la contraseña al vendedor por fuera del sistema; nunca se guarda en
 * ninguna tabla de esta app, solo en auth.users (hasheada por Supabase Auth),
 * mismo principio que la aplicación de contraseña en
 * lib/actions/registro.ts (resolvePasswordReset).
 */
export async function createSeller(
  input: CreateSellerInput,
): Promise<{ error?: string; id?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para crear vendedores." };

  const parsed = createSellerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { email, fullName, storeId, password } = parsed.data;

  const adminClient = createAdminClient();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    return { error: friendlySellerError(createError?.message ?? "") };
  }
  const userId = created.user.id;

  // app_metadata (no "user_metadata" de arriba — ver el comentario de la
  // migración phase4_seller_rpc): fuente real que proxy.ts lee del JWT para
  // enrutar a /tienda en logins futuros.
  const { error: metadataError } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: "seller", store_id: storeId, full_name: fullName },
  });
  if (metadataError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    return { error: "No se pudo completar el alta. Intenta de nuevo." };
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

/** Corrige nombre y/o reasigna tienda de un vendedor ya activo. No cambia is_active/rol. */
export async function updateSeller(
  id: string,
  input: UpdateSellerInput,
): Promise<{ error?: string; success?: boolean; warning?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para editar vendedores." };

  const parsed = updateSellerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { fullName, storeId } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_seller_profile", {
    p_user_id: id,
    p_full_name: fullName,
    p_store_id: storeId,
  });
  if (error) return { error: friendlySellerError(error.message) };

  // Mantiene app_metadata en sincronía con profiles (mismo campo que fija
  // createSeller) — hoy nada crítico lo lee (proxy.ts solo usa el rol), pero
  // evita que quede desincronizado si algo llega a depender de él después.
  const adminClient = createAdminClient();
  const { error: metadataError } = await adminClient.auth.admin.updateUserById(id, {
    app_metadata: { role: "seller", store_id: storeId, full_name: fullName },
  });

  revalidatePath("/admin/vendedores");
  revalidatePath(`/admin/vendedores/${id}`);

  if (metadataError) {
    return {
      success: true,
      warning: "El vendedor quedó actualizado, aunque no se pudo sincronizar un dato interno. Sin impacto en su acceso.",
    };
  }
  return { success: true };
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

/**
 * El admin asigna una contraseña nueva a un vendedor (la actual nunca se
 * puede ver: Supabase Auth solo guarda su hash). Mismo mecanismo que
 * resolvePasswordReset, pero sin solicitud previa. Se verifica por RLS que el
 * destino sea un vendedor, para no usar la service role contra un admin.
 */
export async function setSellerPassword(
  id: string,
  input: ResolvePasswordResetInput,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "No tienes permiso para hacer esto." };

  const parsed = resolvePasswordResetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("role").eq("id", id).single();
  if (target?.role !== "seller") return { error: "Solo se puede cambiar la contraseña de un vendedor." };

  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: parsed.data.password });
  if (error) return { error: "No se pudo cambiar la contraseña." };
  return {};
}
