import { describe, expect, it } from "vitest";
import { createSerialSchema, serialReasonSchema, setBarcodeSchema } from "./serials";

describe("createSerialSchema", () => {
  const valid = {
    productId: "123e4567-e89b-12d3-a456-426614174000",
    lotId: "123e4567-e89b-12d3-a456-426614174001",
    serial: "ABC-001",
    barcode: "750000001",
  };

  it("accepts a valid serial", () => {
    expect(createSerialSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-uuid lotId", () => {
    expect(createSerialSchema.safeParse({ ...valid, lotId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an empty serial", () => {
    expect(createSerialSchema.safeParse({ ...valid, serial: "" }).success).toBe(false);
  });

  it("accepts a missing or empty barcode — it's optional", () => {
    expect(createSerialSchema.safeParse({ ...valid, barcode: "" }).success).toBe(true);
    const { productId, lotId, serial } = valid;
    expect(createSerialSchema.safeParse({ productId, lotId, serial }).success).toBe(true);
  });
});

describe("serialReasonSchema", () => {
  it("requires a non-empty reason", () => {
    expect(serialReasonSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(serialReasonSchema.safeParse({ reason: "   " }).success).toBe(false);
    expect(serialReasonSchema.safeParse({ reason: "dañado" }).success).toBe(true);
  });
});

describe("setBarcodeSchema", () => {
  it("requires a non-empty barcode", () => {
    expect(setBarcodeSchema.safeParse({ barcode: "" }).success).toBe(false);
    expect(setBarcodeSchema.safeParse({ barcode: "   " }).success).toBe(false);
    expect(setBarcodeSchema.safeParse({ barcode: "900000001" }).success).toBe(true);
  });
});
