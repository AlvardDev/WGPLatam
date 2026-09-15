import { z } from "zod";

export const lotSchema = z.object({
  productId: z.uuid("Selecciona un producto"),
  code: z.string().trim().min(1, "Requerido"),
  warrantyDays: z.number().int().positive("Debe ser mayor que 0"),
  receivedOn: z.string().trim(), // "" o "YYYY-MM-DD"; "" se guarda como null
  // Informativo (decisión del usuario): nunca bloquea nada. "" = sin definir.
  expectedCount: z.string().trim(),
});

export type LotInput = z.infer<typeof lotSchema>;

// productId no se edita: un lote no cambia de producto (rompería la FK
// compuesta de serials y la suposición de que product_id no cambia bajo un
// lote ya existente). code sí es editable (a diferencia de products.code).
export const lotUpdateSchema = lotSchema.omit({ productId: true });
export type LotUpdateInput = z.infer<typeof lotUpdateSchema>;
