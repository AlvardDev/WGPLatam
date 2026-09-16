"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  activateWarrantySchema,
  CORRECTABLE_FIELDS,
  createTechnicalReportSchema,
  customerSchema,
  decideClaimSchema,
  decideCorrectionSchema,
  openClaimSchema,
  requestCorrectionSchema,
  serialLookupSchema,
  voidWarrantySchema,
  type CorrectableField,
  type CreateTechnicalReportInput,
  type CustomerInput,
  type DecideClaimInput,
  type DecideCorrectionInput,
  type OpenClaimInput,
  type RequestCorrectionInput,
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
  if (message.includes("edit window has not expired yet")) return "Todavía no pasaron 24 horas: edita directamente en vez de pedir una corrección.";
  if (message.includes("not correctable")) return "Ese campo no se puede corregir.";
  if (message.includes("new value is required")) return "El nuevo valor es obligatorio.";
  if (message.includes("reason is required")) return "El motivo es obligatorio.";
  if (message.includes("pending correction already exists")) return "Ya existe una corrección pendiente para ese campo.";
  if (message.includes("warranty is voided")) return "Esta garantía fue anulada.";
  if (message.includes("only an active seller can request corrections")) return "No tienes permiso para hacer esto.";
  if (message.includes("only admin can decide")) return "No tienes permiso para hacer esto.";
  if (message.includes("correction not found")) return "La corrección no existe.";
  if (message.includes("is not pending")) return "Esta corrección ya fue decidida.";
  if (message.includes("not found or voided")) return "La garantía ya no existe o fue anulada.";
  if (message.includes("changed since the correction was requested")) return "El dato cambió desde que se pidió la corrección; recarga la página.";
  if (message.includes("only admin can void")) return "No tienes permiso para hacer esto.";
  if (message.includes("already voided")) return "Esta garantía ya estaba anulada.";
  if (message.includes("only an active seller can open claims")) return "No tienes permiso para hacer esto.";
  if (message.includes("claim is already open")) return "Ya hay un reclamo abierto para esta garantía.";
  if (message.includes("only admin can assign claims")) return "No tienes permiso para hacer esto.";
  if (message.includes("claim not found")) return "El reclamo no existe.";
  if (message.includes("claim is not open")) return "Este reclamo ya no está abierto.";
  if (message.includes("only admin can decide claims")) return "No tienes permiso para hacer esto.";
  if (message.includes("invalid decision status")) return "Decisión inválida.";
  if (message.includes("decision is required")) return "Indica la resolución del reclamo.";
  if (message.includes("justification is required")) return "Indica el motivo de la decisión.";
  if (message.includes("claim is not under review")) return "Este reclamo no está en revisión.";
  if (message.includes("only admin can close claims")) return "No tienes permiso para hacer esto.";
  if (message.includes("must be decided before closing")) return "El reclamo debe decidirse antes de cerrarse.";
  if (message.includes("only admin can create technical reports")) return "No tienes permiso para hacer esto.";
  if (message.includes("diagnosis is required")) return "Indica el diagnóstico.";
  if (message.includes("result is required")) return "Indica el resultado.";
  if (message.includes("claim is already decided")) return "Este reclamo ya fue decidido; no se pueden agregar más reportes.";
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

// Fase 6 — corrección pasadas las 24h, decisión de admin, anulación.

const FIELD_TO_CUSTOMER_KEY: Record<CorrectableField, keyof CustomerInput> = {
  customer_name: "name",
  customer_national_id: "nationalId",
  customer_whatsapp: "whatsapp",
};

// Un único formulario de 3 campos + motivo; se pide una corrección por cada
// campo que realmente cambió (el modelo de warranty_corrections es un campo
// a la vez — ver docs/DATABASE.md).
export async function requestCorrectionAction(
  warrantyId: string,
  current: CustomerInput,
  next: RequestCorrectionInput,
): Promise<{ error?: string; success?: boolean; requested?: number }> {
  const parsed = requestCorrectionSchema.safeParse(next);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const changedFields = CORRECTABLE_FIELDS.filter(
    (field) => parsed.data.customer[FIELD_TO_CUSTOMER_KEY[field]] !== current[FIELD_TO_CUSTOMER_KEY[field]],
  );
  if (changedFields.length === 0) return { error: "No hay ningún cambio que corregir." };

  const supabase = await createClient();
  for (const field of changedFields) {
    const { error } = await supabase.rpc("request_correction", {
      p_warranty_id: warrantyId,
      p_field: field,
      p_new_value: parsed.data.customer[FIELD_TO_CUSTOMER_KEY[field]],
      p_reason: parsed.data.reason,
    });
    if (error) return { error: friendlyWarrantyError(error.message) };
  }

  revalidatePath(`/tienda/garantias/${warrantyId}`);
  return { success: true, requested: changedFields.length };
}

export async function decideCorrectionAction(
  correctionId: string,
  warrantyId: string,
  input: DecideCorrectionInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = decideCorrectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_correction", {
    p_correction_id: correctionId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath(`/admin/garantias/${warrantyId}`);
  return { success: true };
}

export async function voidWarrantyAction(
  warrantyId: string,
  reason: string,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = voidWarrantySchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_warranty", {
    p_warranty_id: warrantyId,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath(`/admin/garantias/${warrantyId}`);
  revalidatePath("/admin/garantias");
  return { success: true };
}

// Fase 7 — reclamos y reportes técnicos.

export async function openClaimAction(
  warrantyId: string,
  input: OpenClaimInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = openClaimSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_claim", {
    p_warranty_id: warrantyId,
    p_reason: parsed.data.reason,
    p_description: parsed.data.description ?? null,
  });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath(`/tienda/garantias/${warrantyId}`);
  return { success: true };
}

export async function assignClaimAction(
  claimId: string,
  warrantyId: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_claim", { p_claim_id: claimId });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath(`/admin/reclamos/${claimId}`);
  revalidatePath(`/admin/garantias/${warrantyId}`);
  return { success: true };
}

export async function decideClaimAction(
  claimId: string,
  warrantyId: string,
  input: DecideClaimInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = decideClaimSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_claim", {
    p_claim_id: claimId,
    p_status: parsed.data.status,
    p_decision: parsed.data.decision,
    p_justification: parsed.data.justification,
  });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath(`/admin/reclamos/${claimId}`);
  revalidatePath(`/admin/garantias/${warrantyId}`);
  return { success: true };
}

export async function closeClaimAction(
  claimId: string,
  warrantyId: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_claim", { p_claim_id: claimId });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath(`/admin/reclamos/${claimId}`);
  revalidatePath(`/admin/garantias/${warrantyId}`);
  return { success: true };
}

export async function createTechnicalReportAction(
  claimId: string,
  input: CreateTechnicalReportInput,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = createTechnicalReportSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_technical_report", {
    p_claim_id: claimId,
    p_diagnosis: parsed.data.diagnosis,
    p_result: parsed.data.result,
    p_decision: parsed.data.decision,
    p_tests_performed: parsed.data.testsPerformed ?? null,
    p_observations: parsed.data.observations ?? null,
    p_justification: parsed.data.justification ?? null,
  });
  if (error) return { error: friendlyWarrantyError(error.message) };

  revalidatePath(`/admin/reclamos/${claimId}`);
  return { success: true };
}
