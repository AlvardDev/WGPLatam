"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { storeSchema, storeUpdateSchema, type StoreInput, type StoreUpdateInput } from "@/lib/validation/stores";

function toRow(v: StoreUpdateInput) {
  return {
    name: v.name,
    address: v.address || null,
    phone: v.phone || null,
    country_code: v.countryCode,
    timezone: v.timezone,
  };
}

export async function createStore(input: StoreInput): Promise<{ error?: string; id?: string }> {
  const parsed = storeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .insert({ code: parsed.data.code, ...toRow(parsed.data) })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una tienda con ese código." };
    return { error: "No se pudo crear la tienda." };
  }
  revalidatePath("/admin/tiendas");
  return { id: data.id };
}

export async function updateStore(
  id: string,
  input: StoreUpdateInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = storeUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ code: parsed.data.code, ...toRow(parsed.data) })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una tienda con ese código." };
    return { error: "No se pudo guardar la tienda." };
  }
  if (!data || data.length === 0) return { error: "No tienes permiso para editar esta tienda." };

  revalidatePath("/admin/tiendas");
  revalidatePath(`/admin/tiendas/${id}`);
  return { success: true };
}

export async function toggleStoreActive(
  id: string,
  isActive: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");

  if (error) return { error: "No se pudo actualizar el estado de la tienda." };
  if (!data || data.length === 0) return { error: "No tienes permiso para modificar esta tienda." };

  revalidatePath("/admin/tiendas");
  revalidatePath(`/admin/tiendas/${id}`);
  return { success: true };
}
