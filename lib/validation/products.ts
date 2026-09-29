import { z } from "zod";
import { warrantyDaysSchema } from "./common";

// "code" nunca se edita después de crear (inmutable en la base, ver
// migración products_and_lots: private.products_code_guard). Por eso el
// esquema de edición lo omite en vez de simplemente ignorarlo en la UI.
export const productSchema = z.object({
  code: z.string().trim().min(1, "Ingresa el código del producto"),
  name: z.string().trim().min(1, "Ingresa el nombre del producto"),
  description: z.string().trim(),
  howItWorks: z.string().trim(),
  warrantyConditions: z.string().trim(),
  warrantyExclusions: z.string().trim(), // una por línea, igual que app_settings
  defaultWarrantyDays: warrantyDaysSchema,
  // Path dentro del bucket "product-photos" (Storage) — nunca lo escribe el
  // usuario a mano, lo fija product-photo-field.tsx después de subir. null =
  // sin foto.
  photoPath: z.string().trim().min(1).nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema.omit({ code: true });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
