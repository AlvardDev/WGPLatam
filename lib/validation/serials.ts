import { z } from "zod";

export const createSerialSchema = z.object({
  productId: z.uuid("Selecciona un producto"),
  lotId: z.uuid("Selecciona un lote"),
  serial: z.string().trim().min(1, "Requerido"),
  barcode: z.string().trim().optional(),
});

export type CreateSerialInput = z.infer<typeof createSerialSchema>;

export const serialReasonSchema = z.object({
  reason: z.string().trim().min(1, "El motivo es obligatorio"),
});

export type SerialReasonInput = z.infer<typeof serialReasonSchema>;

export const setBarcodeSchema = z.object({
  barcode: z.string().trim().min(1, "Requerido"),
});

export type SetBarcodeInput = z.infer<typeof setBarcodeSchema>;
