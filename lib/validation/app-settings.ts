import { z } from "zod";

// Campos editables de app_settings (todos los grupos: Empresa, Garantías,
// Sistema, Soporte). "id" y "updated_at" no se editan. "logo_path" se
// gestiona con Supabase Storage — fuera de alcance de la Fase 1.
//
// Deliberadamente sin z.optional().default(): el formulario siempre parte
// de defaultValues completos (mapeados desde la fila real de app_settings),
// así que cada campo es un string requerido (puede ser "") en vez de
// optional — evita el desajuste de tipos entre el shape de entrada y el de
// salida de zod que confunde a @hookform/resolvers.
export const appSettingsSchema = z.object({
  companyName: z.string().trim().min(1, "Requerido"),
  companyLegalName: z.string().trim(),
  companyLegalId: z.string().trim(),
  address: z.string().trim(),
  phone: z.string().trim(),
  email: z.union([z.email(), z.literal("")]),
  whatsapp: z.string().trim(),

  // Sin z.coerce: el input HTML se convierte a número en el propio
  // react-hook-form (register(..., { valueAsNumber: true })), no en zod —
  // así el tipo de entrada y salida del schema coinciden.
  defaultWarrantyDays: z.number().int().positive(),
  storeAttentionDays: z.number().int().min(0),
  expiringSoonDays: z.number().int().min(0),
  defaultWarrantyConditions: z.string().trim(),
  defaultWarrantyExclusions: z.string().trim(), // una por línea

  countryCode: z.string().trim(),
  defaultTimezone: z.string().trim().min(1, "Requerido"),
  locale: z.string().trim().min(1, "Requerido"),
  nationalIdLabel: z.string().trim(),

  supportEmail: z.union([z.email(), z.literal("")]),
  supportPhone: z.string().trim(),
  supportWhatsapp: z.string().trim(),
});

export type AppSettingsInput = z.infer<typeof appSettingsSchema>;
