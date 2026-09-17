import { z } from "zod";

export const sellerPasswordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
});

export type SellerPasswordResetRequestInput = z.infer<typeof sellerPasswordResetRequestSchema>;

export const resolvePasswordResetSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export type ResolvePasswordResetInput = z.infer<typeof resolvePasswordResetSchema>;
