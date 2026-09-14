"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { appSettingsSchema, type AppSettingsInput } from "@/lib/validation/app-settings";

/**
 * RLS (app_settings_admin_update) es quien realmente decide si este UPDATE
 * se aplica: si quien llama no es admin, Postgres devuelve 0 filas
 * afectadas, no un error — por eso se comprueba explícitamente.
 */
export async function updateAppSettings(
  input: AppSettingsInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = appSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      company_name: v.companyName,
      company_legal_name: v.companyLegalName,
      company_legal_id: v.companyLegalId,
      address: v.address,
      phone: v.phone,
      email: v.email,
      whatsapp: v.whatsapp,
      default_warranty_days: v.defaultWarrantyDays,
      store_attention_days: v.storeAttentionDays,
      expiring_soon_days: v.expiringSoonDays,
      default_warranty_conditions: v.defaultWarrantyConditions,
      default_warranty_exclusions: v.defaultWarrantyExclusions
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      country_code: v.countryCode,
      default_timezone: v.defaultTimezone,
      locale: v.locale,
      national_id_label: v.nationalIdLabel,
      support_email: v.supportEmail,
      support_phone: v.supportPhone,
      support_whatsapp: v.supportWhatsapp,
    })
    .eq("id", true)
    .select("id");

  if (error) {
    return { error: "No se pudo guardar la configuración." };
  }
  if (!data || data.length === 0) {
    return { error: "No tienes permiso para modificar la configuración." };
  }

  revalidatePath("/admin/ajustes");
  return { success: true };
}
