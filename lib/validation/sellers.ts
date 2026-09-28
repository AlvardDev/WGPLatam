import { z } from "zod";

// storeId no es un valor que el vendedor pueda tocar nunca (SECURITY.md:
// "ningún RPC acepta store_id... confiado a ciegas" — pero aquí sí lo fija
// el ADMIN al crear la cuenta, que es la única identidad que puede asignar
// tienda a otra persona; admin_finalize_seller_profile vuelve a verificar
// is_admin() server-side, no se confía en que esta pantalla sea la única
// puerta).
//
// password: el admin la elige y se la entrega al vendedor por fuera del
// sistema (llamada, WhatsApp, en persona) — no hay correo de invitación de
// por medio (ver lib/actions/sellers.ts, createSeller). Mismo mínimo que
// updatePasswordSchema (lib/validation/auth.ts).
export const createSellerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  fullName: z.string().trim().min(1, "Requerido"),
  storeId: z.string().trim().min(1, "Selecciona una tienda"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export type CreateSellerInput = z.infer<typeof createSellerSchema>;

// Editar un vendedor ya activo: solo nombre y tienda (mismo motivo de
// storeId que arriba). Sin email ni password — el correo no se edita acá
// (es la identidad en auth.users) y la contraseña sigue su propio flujo
// (/admin/vendedores/pendientes, restablecer).
export const updateSellerSchema = z.object({
  fullName: z.string().trim().min(1, "Requerido"),
  storeId: z.string().trim().min(1, "Selecciona una tienda"),
});

export type UpdateSellerInput = z.infer<typeof updateSellerSchema>;
