// Lógica pura, sin dependencias de navegador ni de la librería de parseo:
// comparte la detección de columnas y la construcción de filas entre el
// camino CSV (Papa Parse) y el camino Excel (SheetJS), para que ambos
// formatos apliquen exactamente la misma regla. Testeable con Vitest sin
// un Worker real (ver docs/DATABASE.md, "Importación masiva").

export type ParsedRow = { rowNumber: number; serial: string; barcode: string };

export type RowsResult = { ok: true; rows: ParsedRow[] } | { ok: false; error: string };

const BARCODE_HEADERS = ["codigo_barras", "codigo de barras", "barcode"];

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function findColumnNames(headers: string[]): { serialKey: string; barcodeKey: string } | null {
  const serialKey = headers.find((h) => normalizeHeader(h) === "serial");
  const barcodeKey = headers.find((h) => BARCODE_HEADERS.includes(normalizeHeader(h)));
  if (!serialKey || !barcodeKey) return null;
  return { serialKey, barcodeKey };
}

// startIndex: cuántas filas de datos ya se procesaron antes de este bloque —
// mantiene row_number estable como "posición real en el archivo" a través de
// bloques de streaming, no un contador que se reinicia por bloque.
export function rowsFromRecords(records: Record<string, string>[], startIndex = 0): RowsResult {
  if (records.length === 0) return { ok: true, rows: [] };
  const headers = Object.keys(records[0]);
  const cols = findColumnNames(headers);
  if (!cols) {
    return { ok: false, error: "El archivo debe tener columnas 'serial' y 'codigo_barras'." };
  }

  const rows: ParsedRow[] = [];
  records.forEach((record, i) => {
    const serial = (record[cols.serialKey] ?? "").toString().trim();
    const barcode = (record[cols.barcodeKey] ?? "").toString().trim();
    // Fila totalmente vacía (línea en blanco al final del archivo, típico en
    // CSV): se descarta en silencio, no es un error de negocio. Una fila con
    // solo UNA columna vacía sí se envía — el servidor la clasifica como
    // ERROR (SERIAL_MISSING/BARCODE_MISSING), que es donde vive esa regla.
    if (serial === "" && barcode === "") return;
    rows.push({ rowNumber: startIndex + i + 1, serial, barcode });
  });
  return { ok: true, rows };
}
