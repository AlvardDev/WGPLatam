import { describe, expect, it } from "vitest";
import { lotSchema, lotUpdateSchema } from "./lots";

describe("lotSchema", () => {
  const valid = {
    productId: "123e4567-e89b-12d3-a456-426614174000",
    code: "IMPORT-001",
    warrantyDays: 365,
    receivedOn: "",
    expectedCount: "",
  };

  it("accepts a valid lot", () => {
    expect(lotSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-uuid productId", () => {
    expect(lotSchema.safeParse({ ...valid, productId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an empty code", () => {
    expect(lotSchema.safeParse({ ...valid, code: "" }).success).toBe(false);
  });

  it("rejects a zero or negative warranty duration", () => {
    expect(lotSchema.safeParse({ ...valid, warrantyDays: 0 }).success).toBe(false);
  });

  it("accepts an empty expectedCount (informativo, no obligatorio)", () => {
    expect(lotSchema.safeParse({ ...valid, expectedCount: "" }).success).toBe(true);
  });
});

describe("lotUpdateSchema", () => {
  it("has no productId field (un lote no cambia de producto)", () => {
    expect("productId" in lotUpdateSchema.shape).toBe(false);
  });

  it("keeps code editable", () => {
    expect("code" in lotUpdateSchema.shape).toBe(true);
  });
});
