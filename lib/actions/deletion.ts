"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

// Borrar solo lo que no tiene historial. La autoridad real es la base: todas
// las FK hacia stores/products/lots/serials son RESTRICT, así que un DELETE
// con dependencias falla aunque este chequeo previo se saltara. El conteo de
// acá existe para explicarle al admin QUÉ lo bloquea antes de intentarlo.
const entitySchema = z.enum(["store", "product", "lot", "serial"]);
export type DeletableEntity = z.infer<typeof entitySchema>;
export type Blocker = { label: string; count: number };

const LIST_PATH: Record<DeletableEntity, string> = {
  store: "/admin/tiendas",
  product: "/admin/productos",
  lot: "/admin/lotes",
  serial: "/admin/seriales",
};

// [tabla, columna FK, etiqueta en singular, en plural]
const DEPENDENCIES: Record<DeletableEntity, [string, string, string, string][]> = {
  store: [
    ["warranties", "store_id", "garantía activada", "garantías activadas"],
    ["profiles", "store_id", "vendedor", "vendedores"],
    ["warranty_claims", "store_id", "reclamo", "reclamos"],
    ["warranty_corrections", "store_id", "corrección", "correcciones"],
    ["serial_barcode_waivers", "store_id", "autorización sin código de barras", "autorizaciones sin código de barras"],
  ],
  product: [
    ["warranties", "product_id", "garantía", "garantías"],
    ["serials", "product_id", "serial", "seriales"],
    ["lots", "product_id", "lote", "lotes"],
  ],
  lot: [
    ["serials", "lot_id", "serial", "seriales"],
    ["serial_imports", "lot_id", "importación", "importaciones"],
  ],
  serial: [
    ["warranties", "serial_id", "garantía", "garantías"],
    ["serial_barcode_waivers", "serial_id", "solicitud de autorización", "solicitudes de autorización"],
  ],
};

export async function getDeleteBlockers(
  entity: DeletableEntity,
  id: string,
): Promise<{ error?: string; blockers?: Blocker[] }> {
  if (!entitySchema.safeParse(entity).success || !z.uuid().safeParse(id).success) return { error: "Datos inválidos." };
  if (!(await requireAdmin())) return { error: "No tienes permiso." };

  const supabase = await createClient();
  const counts = await Promise.all(
    DEPENDENCIES[entity].map(async ([table, column, one, many]) => {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, id);
      if (error) throw new Error(error.message);
      return { label: count === 1 ? one : many, count: count ?? 0 };
    }),
  ).catch(() => null);
  if (!counts) return { error: "No se pudo revisar el historial." };

  const blockers = counts.filter((c) => c.count > 0);
  if (entity === "serial") {
    const { data } = await supabase.from("serials").select("status").eq("id", id).single();
    if (data && data.status !== "AVAILABLE") {
      const label = data.status === "ACTIVATED" ? "está activado" : data.status === "BLOCKED" ? "está bloqueado" : "está anulado";
      blockers.unshift({ label, count: 0 });
    }
  }
  return { blockers };
}

export async function deleteEntity(entity: DeletableEntity, id: string): Promise<{ error?: string }> {
  if (!entitySchema.safeParse(entity).success || !z.uuid().safeParse(id).success) return { error: "Datos inválidos." };
  if (!(await requireAdmin())) return { error: "No tienes permiso." };

  const supabase = await createClient();
  const { error } =
    entity === "serial"
      ? await supabase.rpc("delete_serial", { p_serial_id: id })
      : await supabase
          .from(entity === "store" ? "stores" : entity === "product" ? "products" : "lots")
          .delete()
          .eq("id", id);

  if (error) {
    if (error.code === "23503") return { error: "Tiene historial asociado: no se puede eliminar. Desactívalo en su lugar." };
    if (error.message.includes("only AVAILABLE")) return { error: "Solo se pueden eliminar seriales disponibles." };
    return { error: "No se pudo eliminar." };
  }
  revalidatePath(LIST_PATH[entity]);
  return {};
}
