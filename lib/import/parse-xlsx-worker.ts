// Worker dedicado para Excel: a diferencia de Papa Parse, SheetJS no trae un
// modo de streaming (el formato .xlsx es un zip+XML que exige leerse
// completo antes de tener filas) — por eso este archivo existe (Fase 3,
// decisión explícita, ver el plan aprobado). Corre fuera del hilo principal
// para no congelar la UI mientras XLSX.read/sheet_to_json procesan el
// archivo; el resultado se devuelve en bloques (no todo de una vez) para que
// el hilo principal pueda subirlos de forma incremental.
//
// Límite conocido y documentado (docs/DATABASE.md, "Importación masiva"):
// el propio Worker sí mantiene el archivo completo parseado en memoria un
// instante — por eso CSV sigue siendo la recomendación por encima de ~200k
// filas, no Excel.
import * as XLSX from "xlsx";
import { rowsFromRecords } from "./normalize";

const CHUNK_SIZE = 5000;

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const workbook = XLSX.read(event.data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      self.postMessage({ type: "error", message: "El archivo Excel no tiene hojas." });
      return;
    }
    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });

    const parsed = rowsFromRecords(records, 0);
    if (!parsed.ok) {
      self.postMessage({ type: "error", message: parsed.error });
      return;
    }

    for (let i = 0; i < parsed.rows.length; i += CHUNK_SIZE) {
      self.postMessage({ type: "batch", rows: parsed.rows.slice(i, i + CHUNK_SIZE) });
    }
    self.postMessage({ type: "done", totalRows: parsed.rows.length });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : "No se pudo leer el archivo." });
  }
};
