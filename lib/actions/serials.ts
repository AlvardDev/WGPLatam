"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSerialSchema, serialReasonSchema, type CreateSerialInput } from "@/lib/validation/serials";

// Traduce los mensajes de las RPC (ver supabase/migrations/*_serials_rpc.sql)
// a algo que un admin pueda leer sin conocer la implementación.
function friendlySerialError(message: string): string {
  if (message.includes("collision")) return "Ese serial o código de barras ya existe en el sistema.";
  if (message.includes("must differ")) return "El serial y el código de barras no pueden ser iguales.";
  if (message.includes("does not belong")) return "El lote seleccionado no pertenece a ese producto.";
  if (message.includes("not active")) return "El lote seleccionado está inactivo.";
  if (message.includes("lot not found")) return "El lote no existe.";
  if (message.includes("invalid transition")) return "Ese serial no puede pasar a ese estado desde el estado actual.";
  if (message.includes("reason is required")) return "El motivo es obligatorio.";
  if (message.includes("serial not found")) return "El serial no existe.";
  return "No se pudo completar la operación.";
}

export async function createSerialAction(
  input: CreateSerialInput,
): Promise<{ error?: string; id?: string }> {
  const parsed = createSerialSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_serial", {
    p_product_id: v.productId,
    p_lot_id: v.lotId,
    p_serial: v.serial,
    p_barcode: v.barcode,
  });

  if (error) return { error: friendlySerialError(error.message) };
  revalidatePath("/admin/seriales");
  return { id: data as string };
}

export async function blockSerialAction(
  id: string,
  reason: string,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = serialReasonSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("block_serial", { p_serial_id: id, p_reason: parsed.data.reason });
  if (error) return { error: friendlySerialError(error.message) };
  revalidatePath("/admin/seriales");
  return { success: true };
}

export async function unblockSerialAction(id: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_serial", { p_serial_id: id });
  if (error) return { error: friendlySerialError(error.message) };
  revalidatePath("/admin/seriales");
  return { success: true };
}

export async function voidSerialAction(
  id: string,
  reason: string,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = serialReasonSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_serial", { p_serial_id: id, p_reason: parsed.data.reason });
  if (error) return { error: friendlySerialError(error.message) };
  revalidatePath("/admin/seriales");
  return { success: true };
}
