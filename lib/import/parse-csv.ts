"use client";

import Papa from "papaparse";
import { rowsFromRecords, type ParsedRow } from "./normalize";

// Papa Parse ya incluye su propio Web Worker (worker: true) — no hace falta
// escribir uno a mano para CSV, a diferencia de Excel (ver parse-xlsx.ts).
// chunkSize agrupa por tamaño de texto (~medio MB), no por conteo exacto de
// filas: mismo objetivo que los "bloques de ~5.000 filas" de
// docs/DATABASE.md, sin cargar el archivo completo en memoria.
//
// Bug real encontrado en la verificación E2E de esta fase: con worker:true,
// parser.pause()/resume() lanzan "Error: Not implemented" — Papa Parse solo
// soporta pausar el streaming cuando corre en el hilo principal (worker:
// false), no dentro de su propio worker. La cola+drenaje de abajo logra el
// mismo control de contrapresión (nunca hay más de un bloque en vuelo hacia
// stage_import_rows) sin depender de esa API — mismo patrón que
// parse-xlsx.ts.
const CHUNK_SIZE_BYTES = 512 * 1024;

export function parseCsvStreaming(
  file: File,
  onBatch: (rows: ParsedRow[]) => Promise<void>,
): Promise<{ totalRows: number }> {
  return new Promise((resolve, reject) => {
    let rowsSeen = 0;
    let totalValid = 0;
    const queue: ParsedRow[][] = [];
    let processing = false;
    let parseDone = false;
    let failed = false;

    const drain = async () => {
      if (processing || failed) return;
      processing = true;
      while (queue.length > 0) {
        const rows = queue.shift()!;
        try {
          await onBatch(rows);
        } catch (err) {
          failed = true;
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
      }
      processing = false;
      if (parseDone && queue.length === 0) resolve({ totalRows: totalValid });
    };

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      chunkSize: CHUNK_SIZE_BYTES,
      chunk: (results, parser) => {
        if (failed) return;
        const parsed = rowsFromRecords(results.data, rowsSeen);
        rowsSeen += results.data.length;
        if (!parsed.ok) {
          failed = true;
          parser.abort();
          reject(new Error(parsed.error));
          return;
        }
        totalValid += parsed.rows.length;
        queue.push(parsed.rows);
        void drain();
      },
      complete: () => {
        parseDone = true;
        if (!failed && queue.length === 0 && !processing) resolve({ totalRows: totalValid });
      },
      error: (err) => reject(err),
    });
  });
}
