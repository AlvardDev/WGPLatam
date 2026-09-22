"use client";

// Toda esta capa llama a Supabase DIRECTO desde el navegador (createClient
// de lib/supabase/client.ts), no via Server Actions: docs/DATABASE.md exige
// que los bloques de staging vayan navegador -> Supabase para no chocar con
// el límite de 8s de "authenticated" ni los límites de body de Next/Vercel
// en Server Actions. RLS y las RPC ya son la autoridad, no hace falta pasar
// por el servidor de Next para esto — única divergencia deliberada del
// patrón de lib/actions/*.ts usado en el resto del proyecto.
import { createClient } from "@/lib/supabase/client";
import { parseImportFile } from "./parse-file";
import type { ParsedRow } from "./normalize";

function friendlyImportError(message: string): string {
  if (message.includes("lot is not active")) return "El lote seleccionado está inactivo.";
  if (message.includes("lot not found")) return "El lote no existe o no tienes acceso.";
  if (message.includes("is not in STAGING")) return "Esta importación ya no está en preparación.";
  if (message.includes("cannot be committed")) return "Esta importación ya fue confirmada o no existe.";
  if (message.includes("is not in COMMITTING")) return "Esta importación no se puede procesar en su estado actual.";
  if (message.includes("cannot be cancelled")) return "Esta importación ya no se puede cancelar.";
  if (message.includes("must be COMPLETED or CANCELLED"))
    return "Solo se puede limpiar el detalle de una importación terminada o cancelada.";
  if (message.includes("invalid batch size")) return "Tamaño de bloque inválido.";
  if (message.includes("only admin")) return "Solo un administrador puede realizar esta acción.";
  return "No se pudo completar la operación.";
}

export async function createImport(lotId: string, fileName: string): Promise<{ id: string } | { error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("serial_imports")
    .insert({ lot_id: lotId, file_name: fileName })
    .select("id")
    .single();
  if (error) return { error: friendlyImportError(error.message) };
  return { id: data.id as string };
}

// Envía los bloques SECUENCIALMENTE (espera cada stage_import_rows antes del
// siguiente): parse-csv.ts/parse-xlsx.ts ya lo garantizan (pausan hasta que
// onBatch resuelve). Es lo que hace correcta la detección de "duplicado
// contra un bloque anterior" en stage_import_rows sin tener que reordenar
// nada del lado del servidor.
export async function uploadFile(
  importId: string,
  file: File,
  onProgress: (rowsSent: number) => void,
): Promise<{ totalRows: number } | { error: string }> {
  const supabase = createClient();
  let rowsSent = 0;
  try {
    const result = await parseImportFile(file, async (rows: ParsedRow[]) => {
      const { error } = await supabase.rpc("stage_import_rows", {
        p_import_id: importId,
        p_rows: rows.map((r) => ({ row_number: r.rowNumber, serial: r.serial, barcode: r.barcode })),
      });
      if (error) throw new Error(error.message);
      rowsSent += rows.length;
      onProgress(rowsSent);
    });
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo procesar el archivo." };
  }
}

export type ImportCounts = { total: number; valid: number; duplicate: number; error: number; missingBarcode: number };

// count(*) por estado en vez de traer cada fila: una importación real puede
// tener hasta 1M filas (docs/DATABASE.md), y esto corre en el navegador
// ("use client", arriba) — traer todo acá era exactamente el "cargar
// grandes datasets completos en el frontend" que el proyecto prohíbe, y
// además daba un conteo silenciosamente incorrecto por el tope de 1000
// filas por respuesta de PostgREST (solo contaba las primeras 1000).
export async function fetchPreviewCounts(importId: string): Promise<ImportCounts> {
  const supabase = createClient();
  const base = () => supabase.from("serial_import_rows").select("id", { count: "exact", head: true }).eq("import_id", importId);
  const [total, valid, duplicateInFile, duplicateExisting, error, missingBarcode] = await Promise.all([
    base(),
    base().eq("status", "VALID"),
    base().eq("status", "DUPLICATE_IN_FILE"),
    base().eq("status", "DUPLICATE_EXISTING"),
    base().eq("status", "ERROR"),
    base().eq("status", "VALID").is("barcode", null),
  ]);
  return {
    total: total.count ?? 0,
    valid: valid.count ?? 0,
    duplicate: (duplicateInFile.count ?? 0) + (duplicateExisting.count ?? 0),
    error: error.count ?? 0,
    missingBarcode: missingBarcode.count ?? 0,
  };
}

export async function confirmImport(importId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("start_import_commit", { p_import_id: importId });
  if (error) return { error: friendlyImportError(error.message) };
  return {};
}

type CommitBatchRow = { committed_count: number; conflicted_count: number; remaining_count: number; done: boolean };

// Bucle de confirmación real: sigue llamando commit_import_batch hasta que
// "done" es true. Es seguro reanudarlo desde cero en cualquier momento
// (cerrar la pestaña, recargar, reintentar) porque cada llamada solo procesa
// lo que sigue en VALID — ver la migración phase3_import_rpc.sql.
export async function commitLoop(
  importId: string,
  onProgress: (committed: number, conflicted: number, remaining: number) => void,
): Promise<{ error?: string }> {
  const supabase = createClient();
  let totalCommitted = 0;
  let totalConflicted = 0;
  for (;;) {
    const { data, error } = await supabase.rpc("commit_import_batch", {
      p_import_id: importId,
      p_batch_size: 2000,
    });
    if (error) return { error: friendlyImportError(error.message) };
    const row = (data as unknown as CommitBatchRow[])[0];
    totalCommitted += row.committed_count;
    totalConflicted += row.conflicted_count;
    onProgress(totalCommitted, totalConflicted, row.remaining_count);
    if (row.done) break;
  }
  return {};
}

export async function cancelImportAction(importId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_import", { p_import_id: importId });
  if (error) return { error: friendlyImportError(error.message) };
  return {};
}

export async function purgeImportStaging(importId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("purge_import_staging", { p_import_id: importId });
  if (error) return { error: friendlyImportError(error.message) };
  return {};
}
