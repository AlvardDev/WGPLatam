import { z } from "zod";

// Sin storeId: un admin/superadmin nunca tiene tienda (ver
// admin_finalize_admin_profile, que la fija en null siempre).
export const inviteAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  fullName: z.string().trim().min(1, "Requerido"),
});

export type InviteAdminInput = z.infer<typeof inviteAdminSchema>;
