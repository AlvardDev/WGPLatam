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

// Fase 6 — correcciones, anulación.
export const CORRECTABLE_FIELDS = ["customer_name", "customer_national_id", "customer_whatsapp"] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export const requestCorrectionSchema = z.object({
  reason: z.string().trim().min(10, "Describe el motivo (mínimo 10 caracteres)"),
  customer: customerSchema,
});
export type RequestCorrectionInput = z.infer<typeof requestCorrectionSchema>;

export const decideCorrectionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});
export type DecideCorrectionInput = z.infer<typeof decideCorrectionSchema>;

export const voidWarrantySchema = z.object({
  reason: z.string().trim().min(5, "Indica el motivo de la anulación"),
});
export type VoidWarrantyInput = z.infer<typeof voidWarrantySchema>;

// Fase 7 — reclamos y reportes técnicos.
export const openClaimSchema = z.object({
  reason: z.string().trim().min(5, "Indica el motivo del reclamo"),
  description: z.string().trim().max(2000).optional(),
});
export type OpenClaimInput = z.infer<typeof openClaimSchema>;

export const decideClaimSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  decision: z.string().trim().min(3, "Indica la resolución"),
  justification: z.string().trim().min(3, "Indica el motivo de la decisión"),
});
export type DecideClaimInput = z.infer<typeof decideClaimSchema>;

export const createTechnicalReportSchema = z.object({
  diagnosis: z.string().trim().min(3, "Indica el diagnóstico"),
  result: z.string().trim().min(3, "Indica el resultado"),
  decision: z.string().trim().min(3, "Indica la decisión"),
  testsPerformed: z.string().trim().max(2000).optional(),
  observations: z.string().trim().max(2000).optional(),
  justification: z.string().trim().max(2000).optional(),
});
export type CreateTechnicalReportInput = z.infer<typeof createTechnicalReportSchema>;
