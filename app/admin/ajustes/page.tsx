import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import { NotificationSettingsForm } from "./notification-settings-form";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (error || !settings) {
    throw new Error("No se pudo cargar la configuración.");
  }

  const { data: notificationSettings, error: notificationError } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (notificationError || !notificationSettings) {
    throw new Error("No se pudo cargar la configuración de notificaciones.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">
          Configuración pública del negocio: empresa, garantías, sistema y soporte.
        </p>
      </div>
      <SettingsForm
        defaultValues={{
          companyName: settings.company_name,
          companyLegalName: settings.company_legal_name,
          companyLegalId: settings.company_legal_id,
          address: settings.address ?? "",
          phone: settings.phone ?? "",
          email: settings.email ?? "",
          whatsapp: settings.whatsapp ?? "",
          defaultWarrantyDays: settings.default_warranty_days,
          storeAttentionDays: settings.store_attention_days,
          expiringSoonDays: settings.expiring_soon_days,
          defaultWarrantyConditions: settings.default_warranty_conditions ?? "",
          defaultWarrantyExclusions: (settings.default_warranty_exclusions ?? []).join("\n"),
          countryCode: settings.country_code ?? "",
          defaultTimezone: settings.default_timezone,
          locale: settings.locale,
          nationalIdLabel: settings.national_id_label ?? "",
          supportEmail: settings.support_email ?? "",
          supportPhone: settings.support_phone ?? "",
          supportWhatsapp: settings.support_whatsapp ?? "",
        }}
      />
      <NotificationSettingsForm
        defaultValues={{
          emailEnabled: notificationSettings.email_enabled,
          fromEmail: notificationSettings.from_email ?? "",
          fromName: notificationSettings.from_name ?? "",
          adminNotificationEmails: (notificationSettings.admin_notification_emails ?? []).join("\n"),
        }}
      />
    </div>
  );
}
