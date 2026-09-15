"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lotSchema, lotUpdateSchema, type LotInput, type LotUpdateInput } from "@/lib/validation/lots";

export async function createLot(input: LotInput): Promise<{ error?: string; id?: string }> {
  const parsed = lotSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .insert({
      product_id: v.productId,
      code: v.code,
      warranty_days: v.warrantyDays,
      received_on: v.receivedOn || null,
      expected_count: v.expectedCount ? Number(v.expectedCount) : null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya existe un lote con ese código para este producto." };
    if (error.code === "23503") return { error: "El producto seleccionado no existe." };
    return { error: "No se pudo crear el lote." };
  }
  revalidatePath("/admin/lotes");
  return { id: data.id };
}

export async function updateLot(
  id: string,
  input: LotUpdateInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = lotUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .update({
      code: v.code,
      warranty_days: v.warrantyDays,
      received_on: v.receivedOn || null,
      expected_count: v.expectedCount ? Number(v.expectedCount) : null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23505") return { error: "Ya existe un lote con ese código para este producto." };
    return { error: "No se pudo guardar el lote." };
  }
  if (!data || data.length === 0) return { error: "No tienes permiso para editar este lote." };

  revalidatePath("/admin/lotes");
  revalidatePath(`/admin/lotes/${id}`);
  return { success: true };
}

export async function toggleLotActive(
  id: string,
  isActive: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");

  if (error) return { error: "No se pudo actualizar el estado del lote." };
  if (!data || data.length === 0) return { error: "No tienes permiso para modificar este lote." };

  revalidatePath("/admin/lotes");
  revalidatePath(`/admin/lotes/${id}`);
  return { success: true };
}
