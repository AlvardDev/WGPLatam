"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  activateWarrantySchema,
  customerSchema,
  serialLookupSchema,
  type CustomerInput,
} from "@/lib/validation/warranties";

// Traduce los mensajes de las RPC (ver supabase/migrations/*_phase5_warranties.sql).
function friendlyWarrantyError(message: string): string {
  if (message.includes("serial not found")) return "No existe ningún serial con ese código.";
  if (message.includes("serial already activated")) return "Este serial ya tiene una garantía activada.";
  if (message.includes("serial is blocked")) return "Este serial está bloqueado y no puede activarse.";
  if (message.includes("serial is void")) return "Este serial está anulado y no puede activarse.";
  if (message.includes("product is not active")) return "El producto de este serial está inactivo.";
  if (message.includes("lot is not active")) return "El lote de este serial está inactivo.";
  if (message.includes("customer name is required")) return "El nombre del cliente es obligatorio.";
  if (message.includes("customer national id is required")) return "La identificación del cliente es obligatoria.";
  if (message.includes("customer whatsapp is required")) return "El WhatsApp del cliente es obligatorio.";
  if (message.includes("E.164 format")) return "El WhatsApp debe estar en formato internacional (ej. +584121234567).";
  if (message.includes("only an active seller")) return "No tienes permiso para hacer esto.";
  if (message.includes("warranty not found")) return "La garantía no existe.";
  if (message.includes("belongs to another store")) return "No tienes permiso para editar esta garantía.";
  if (message.includes("edit window has expired")) return "Pasaron más de 24 horas desde la activación: ya no se puede editar aquí.";
  return "No se pudo completar la operación.";
}

export type SerialLookupResult = {
  serial_id: string;
  serial: string;
  barcode: string;
  product_code: string;
  product_name: string;
  warranty_duration_days: number;
  status: "AVAILABLE" | "ACTIVATED" | "BLOCKED" | "VOID";
};

export async function lookupSerialAction(
  code: string,
): Promise<{ error?: string; result?: SerialLookupResult | null }> {
  const parsed = serialLookupSchema.safeParse({ code });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_serial", { p_code: parsed.data.code });
  if (error) return { error: friendlyWarrantyError(error.message) };

  const rows = data as SerialLookupResult[] | null;
  return { result: rows && rows.length > 0 ? rows[0] : null };
}

export type ActivateWarrantyResult = {
  warranty_id: string;
  activated_at: string;
  expires_at: string;
  duration_days: number;
  product_name: string;
  serial: string;
  barcode: string;
  lot_code: string;
};

export async function activateWarrantyAction(
  code: string,
  customer: CustomerInput,
): Promise<{ error?: string; result?: ActivateWarrantyResult }> {
  const parsed = activateWarrantySchema.safeParse({ code, customer });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activate_warranty", {
    p_code: parsed.data.code,
    p_customer: {
      name: parsed.data.customer.name,
      national_id: parsed.data.customer.nationalId,
      whatsapp: parsed.data.customer.whatsapp,
    },
  });
  if (error) return { error: friendlyWarrantyError(error.message) };

  const rows = data as ActivateWarrantyResult[] | null;
  const result = rows?.[0];
  if (!result) return { error: "No se pudo completar la operación." };

  revalidatePath("/tienda");
  return { result };
}

export async function updateWarrantyCustomerAction(
  warrantyId: string,
  customer: CustomerInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = customerSchema.safeParse(customer);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_warranty_customer", {
    p_warranty_id: warrantyId,
    p_customer: {
      name: parsed.data.name,
      national_id: parsed.data.nationalId,
      whatsapp: parsed.data.whatsapp,
    },
  });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath("/tienda");
  revalidatePath(`/tienda/garantias/${warrantyId}`);
  return { success: true };
}
