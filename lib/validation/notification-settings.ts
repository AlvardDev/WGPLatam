import { z } from "zod";

// Configuración funcional de email (Fase 6): nunca secretos. RESEND_API_KEY
// vive solo como secreto de la Edge Function — ver
// supabase/functions/dispatch-notifications.
const emailSchema = z.email();

export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean(),
  fromEmail: z.union([z.email(), z.literal("")]),
  fromName: z.string().trim(),
  adminNotificationEmails: z
    .string()
    .trim()
    .refine(
      (value) =>
        value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .every((line) => emailSchema.safeParse(line).success),
      "Cada línea debe ser un correo válido",
    ),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
