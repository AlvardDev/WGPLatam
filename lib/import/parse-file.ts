"use client";

import type { ParsedRow } from "./normalize";
import { parseCsvStreaming } from "./parse-csv";
import { parseXlsxStreaming } from "./parse-xlsx";

export function parseImportFile(
  file: File,
  onBatch: (rows: ParsedRow[]) => Promise<void>,
): Promise<{ totalRows: number }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsvStreaming(file, onBatch);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXlsxStreaming(file, onBatch);
  return Promise.reject(new Error("Formato no soportado. Usa un archivo .csv o .xlsx."));
}
