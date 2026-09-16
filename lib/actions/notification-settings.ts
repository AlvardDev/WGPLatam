"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  notificationSettingsSchema,
  type NotificationSettingsInput,
} from "@/lib/validation/notification-settings";

// Mismo patrón que lib/actions/app-settings.ts: RLS (notification_settings_admin_all)
// decide si el UPDATE se aplica; 0 filas afectadas para un no-admin, no un error.
export async function updateNotificationSettings(
  input: NotificationSettingsInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = notificationSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .update({
      email_enabled: v.emailEnabled,
      from_email: v.fromEmail || null,
      from_name: v.fromName || null,
      admin_notification_emails: v.adminNotificationEmails
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    })
    .eq("id", true)
    .select("id");

  if (error) return { error: "No se pudo guardar la configuración." };
  if (!data || data.length === 0) return { error: "No tienes permiso para modificar la configuración." };

  revalidatePath("/admin/ajustes");
  return { success: true };
}
