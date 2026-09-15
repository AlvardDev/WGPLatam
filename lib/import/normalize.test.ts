import { describe, expect, it } from "vitest";
import { findColumnNames, rowsFromRecords } from "./normalize";

describe("findColumnNames", () => {
  it("detects serial/codigo_barras case-insensitively and with acentos", () => {
    expect(findColumnNames(["Serial", "Código_Barras"])).toEqual({
      serialKey: "Serial",
      barcodeKey: "Código_Barras",
    });
  });

  it("accepts 'barcode' as an alternate header", () => {
    expect(findColumnNames(["serial", "barcode"])).toEqual({ serialKey: "serial", barcodeKey: "barcode" });
  });

  it("returns null when a required column is missing", () => {
    expect(findColumnNames(["serial", "otra_columna"])).toBeNull();
    expect(findColumnNames(["codigo_barras"])).toBeNull();
  });
});

describe("rowsFromRecords", () => {
  it("rejects a file without the required columns", () => {
    const result = rowsFromRecords([{ nombre: "x" }]);
    expect(result.ok).toBe(false);
  });

  it("accepts an empty file (no data rows) as ok with zero rows", () => {
    expect(rowsFromRecords([])).toEqual({ ok: true, rows: [] });
  });

  it("skips a fully blank row but keeps a partially blank one", () => {
    const result = rowsFromRecords([
      { serial: "A-1", codigo_barras: "B-1" },
      { serial: "", codigo_barras: "" },
      { serial: "A-2", codigo_barras: "" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      { rowNumber: 1, serial: "A-1", barcode: "B-1" },
      { rowNumber: 3, serial: "A-2", barcode: "" },
    ]);
  });

  it("trims values and offsets rowNumber by startIndex across chunks", () => {
    const result = rowsFromRecords([{ serial: "  A-1  ", codigo_barras: " B-1 " }], 5000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([{ rowNumber: 5001, serial: "A-1", barcode: "B-1" }]);
  });
});
