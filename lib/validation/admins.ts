import { z } from "zod";

// Sin storeId: un admin/superadmin nunca tiene tienda (ver
// admin_finalize_admin_profile, que la fija en null siempre). Sin
// invitación por correo — bloqueada por el límite de 2/hora del SMTP
// incluido de Supabase sin dominio propio (mismo motivo documentado para
// vendedores, docs/PROGRESS.md Fase 9) — el superadmin fija la contraseña
// directamente y se la comunica por fuera, igual que en
// /admin/vendedores/pendientes.
export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  fullName: z.string().trim().min(1, "Requerido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
