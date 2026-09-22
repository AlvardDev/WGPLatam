"use client";

import { rowsFromLines, type ParsedRow } from "./normalize";

const CHUNK_LINES = 5000;

// Formato "bloc de notas": un serial por línea, sin encabezado ni columna de
// código de barras (se completa después, ver set_serial_barcode). Sin
// Worker ni streaming real: partir un archivo de texto plano en líneas es
// trivial en memoria incluso a 1M de filas, a diferencia de parsear
// CSV/Excel (parse-csv.ts/parse-xlsx.ts) — no amerita esa complejidad.
export async function parseTxtStreaming(
  file: File,
  onBatch: (rows: ParsedRow[]) => Promise<void>,
): Promise<{ totalRows: number }> {
  const lines = (await file.text()).split(/\r?\n/);
  let totalRows = 0;
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    const rows = rowsFromLines(lines.slice(i, i + CHUNK_LINES), i);
    if (rows.length > 0) {
      await onBatch(rows);
      totalRows += rows.length;
    }
  }
  return { totalRows };
}
