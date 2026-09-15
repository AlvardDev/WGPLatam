import { z } from "zod";

// storeId no es un valor que el vendedor pueda tocar nunca (SECURITY.md:
// "ningún RPC acepta store_id... confiado a ciegas" — pero aquí sí lo fija
// el ADMIN al invitar, que es la única identidad que puede asignar tienda a
// otra persona; admin_finalize_seller_profile vuelve a verificar is_admin()
// server-side, no se confía en que esta pantalla sea la única puerta).
export const inviteSellerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  fullName: z.string().trim().min(1, "Requerido"),
  storeId: z.string().trim().min(1, "Selecciona una tienda"),
});

export type InviteSellerInput = z.infer<typeof inviteSellerSchema>;
