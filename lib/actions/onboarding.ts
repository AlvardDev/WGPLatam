"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Sin input: la RPC siempre opera sobre auth.uid() (ver
 * supabase/migrations/20260918070000_admin_onboarding.sql). Se llama tanto
 * al cerrar el tour la primera vez como al repetirlo desde Ajustes — en
 * ambos casos solo actualiza el timestamp, idempotente.
 */
export async function completeOnboarding(): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding");
  if (error) return { error: "No se pudo guardar el estado del tutorial." };

  revalidatePath("/admin", "layout");
  return { success: true };
}
