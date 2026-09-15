"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  productSchema,
  productUpdateSchema,
  type ProductInput,
  type ProductUpdateInput,
} from "@/lib/validation/products";

function toRow(v: ProductUpdateInput) {
  return {
    name: v.name,
    description: v.description || null,
    how_it_works: v.howItWorks || null,
    warranty_conditions: v.warrantyConditions,
    warranty_exclusions: v.warrantyExclusions
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    default_warranty_days: v.defaultWarrantyDays,
  };
}

export async function createProduct(input: ProductInput): Promise<{ error?: string; id?: string }> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ code: parsed.data.code, ...toRow(parsed.data) })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya existe un producto con ese código." };
    return { error: "No se pudo crear el producto." };
  }
  revalidatePath("/admin/productos");
  return { id: data.id };
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = productUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(toRow(parsed.data))
    .eq("id", id)
    .select("id");

  if (error) return { error: "No se pudo guardar el producto." };
  if (!data || data.length === 0) return { error: "No tienes permiso para editar este producto." };

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${id}`);
  return { success: true };
}

export async function toggleProductActive(
  id: string,
  isActive: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");

  if (error) return { error: "No se pudo actualizar el estado del producto." };
  if (!data || data.length === 0) return { error: "No tienes permiso para modificar este producto." };

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${id}`);
  return { success: true };
}
