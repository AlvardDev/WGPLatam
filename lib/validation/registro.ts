import { z } from "zod";

export const sellerRegisterSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Correo inválido"),
    fullName: z.string().trim().min(1, "Requerido"),
    storeId: z.string().trim().min(1, "Selecciona una tienda"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type SellerRegisterInput = z.infer<typeof sellerRegisterSchema>;

export const sellerPasswordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
});

export type SellerPasswordResetRequestInput = z.infer<typeof sellerPasswordResetRequestSchema>;

export const resolvePasswordResetSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export type ResolvePasswordResetInput = z.infer<typeof resolvePasswordResetSchema>;
