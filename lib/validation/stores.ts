import { z } from "zod";

// "code" es editable (a diferencia de products.code): no hay guard de
// inmutabilidad en la migración de stores. Unicidad la exige el índice
// único de la base (23505 se traduce a un mensaje legible en la action).
export const storeSchema = z.object({
  code: z.string().trim().min(1, "Requerido"),
  name: z.string().trim().min(1, "Requerido"),
  address: z.string().trim(),
  phone: z.string().trim(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Código de país ISO de 2 letras (ej. VE, CO, MX)"),
  timezone: z.string().trim().min(1, "Requerido"),
});

export type StoreInput = z.infer<typeof storeSchema>;

export const storeUpdateSchema = storeSchema;
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;
