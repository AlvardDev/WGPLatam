"use client";

import type { ParsedRow } from "./normalize";

type WorkerMessage =
  | { type: "batch"; rows: ParsedRow[] }
  | { type: "done"; totalRows: number }
  | { type: "error"; message: string };

export function parseXlsxStreaming(
  file: File,
  onBatch: (rows: ParsedRow[]) => Promise<void>,
): Promise<{ totalRows: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./parse-xlsx-worker.ts", import.meta.url), { type: "module" });
    // Los bloques del worker llegan más rápido de lo que la subida real
    // puede procesarlos (esta cola evita perder el orden si se acumulan).
    const queue: ParsedRow[][] = [];
    let processing = false;
    let done = false;
    let total = 0;

    const drain = async () => {
      if (processing) return;
      processing = true;
      while (queue.length > 0) {
        const rows = queue.shift()!;
        try {
          await onBatch(rows);
        } catch (err) {
          worker.terminate();
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
      }
      processing = false;
      if (done && queue.length === 0) {
        worker.terminate();
        resolve({ totalRows: total });
      }
    };

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.type === "batch") {
        queue.push(msg.rows);
        void drain();
      } else if (msg.type === "done") {
        total = msg.totalRows;
        done = true;
        void drain();
      } else if (msg.type === "error") {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || "Error leyendo el archivo Excel."));
    };

    file.arrayBuffer().then((buffer) => worker.postMessage(buffer, [buffer]));
  });
}
