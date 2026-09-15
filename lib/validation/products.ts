import { z } from "zod";

// "code" nunca se edita después de crear (inmutable en la base, ver
// migración products_and_lots: private.products_code_guard). Por eso el
// esquema de edición lo omite en vez de simplemente ignorarlo en la UI.
export const productSchema = z.object({
  code: z.string().trim().min(1, "Requerido"),
  name: z.string().trim().min(1, "Requerido"),
  description: z.string().trim(),
  howItWorks: z.string().trim(),
  warrantyConditions: z.string().trim(),
  warrantyExclusions: z.string().trim(), // una por línea, igual que app_settings
  // Sin z.coerce: react-hook-form convierte con valueAsNumber (mismo patrón
  // de lib/validation/app-settings.ts, tras el problema real de Fase 1).
  defaultWarrantyDays: z.number().int().positive("Debe ser mayor que 0"),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema.omit({ code: true });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
