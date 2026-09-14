"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
  type LoginInput,
  type RequestPasswordResetInput,
  type UpdatePasswordInput,
} from "@/lib/validation/auth";
import { roleHomePath, type AppRole } from "@/lib/auth/role-path";

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

export async function signIn(input: LoginInput): Promise<{ error: string } | void> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "Correo o contraseña incorrectos." };
  }

  // Best-effort: si falla el registro de auditoría no debe bloquear el login.
  await supabase.rpc("log_audit_event", { p_action: "login" });

  const role = (data.user.app_metadata as { role?: AppRole } | null)?.role ?? null;
  redirect(roleHomePath(role));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    await supabase.rpc("log_audit_event", { p_action: "logout" });
  }
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const redirectTo = `${await origin()}/auth/callback?next=/actualizar-clave`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

  // Nunca revelar si el correo existe o no (evita enumeración de usuarios).
  if (error) {
    return { error: "No se pudo procesar la solicitud. Intenta de nuevo." };
  }
  return { success: true };
}

export async function updatePassword(
  input: UpdatePasswordInput,
): Promise<{ error: string } | void> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error || !data.user) {
    return { error: "No se pudo actualizar la contraseña. El enlace puede haber expirado." };
  }

  const role = (data.user.app_metadata as { role?: AppRole } | null)?.role ?? null;
  redirect(roleHomePath(role));
}
