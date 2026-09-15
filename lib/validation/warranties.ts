import { z } from "zod";

export const serialLookupSchema = z.object({
  code: z.string().trim().min(1, "Ingresa un serial o código de barras"),
});
export type SerialLookupInput = z.infer<typeof serialLookupSchema>;

// E.164: '+' seguido de 7 a 15 dígitos, el primero distinto de 0.
const E164 = /^\+[1-9]\d{6,14}$/;

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Requerido"),
  nationalId: z.string().trim().min(1, "Requerido"),
  whatsapp: z
    .string()
    .trim()
    .regex(E164, "Usa formato internacional, ej. +584121234567"),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const activateWarrantySchema = z.object({
  code: z.string().trim().min(1),
  customer: customerSchema,
});
export type ActivateWarrantyInput = z.infer<typeof activateWarrantySchema>;
