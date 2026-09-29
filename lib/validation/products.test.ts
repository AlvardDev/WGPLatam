import { describe, expect, it } from "vitest";
import { productSchema, productUpdateSchema } from "./products";

describe("productSchema", () => {
  const valid = {
    code: "X100",
    name: "Producto X100",
    description: "",
    howItWorks: "",
    warrantyConditions: "",
    warrantyExclusions: "",
    defaultWarrantyDays: 365,
    photoPath: null,
  };

  it("accepts a valid product", () => {
    expect(productSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a product with a photo path", () => {
    expect(productSchema.safeParse({ ...valid, photoPath: "abc123.jpg" }).success).toBe(true);
  });

  it("rejects an empty (non-null) photo path", () => {
    expect(productSchema.safeParse({ ...valid, photoPath: "" }).success).toBe(false);
  });

  it("rejects an empty code", () => {
    expect(productSchema.safeParse({ ...valid, code: "" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(productSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects a zero or negative warranty duration", () => {
    expect(productSchema.safeParse({ ...valid, defaultWarrantyDays: 0 }).success).toBe(false);
    expect(productSchema.safeParse({ ...valid, defaultWarrantyDays: -5 }).success).toBe(false);
  });

  it("rejects more than 4 digits of warranty days, decimals and empty (NaN)", () => {
    expect(productSchema.safeParse({ ...valid, defaultWarrantyDays: 9999 }).success).toBe(true);
    expect(productSchema.safeParse({ ...valid, defaultWarrantyDays: 10000 }).success).toBe(false);
    expect(productSchema.safeParse({ ...valid, defaultWarrantyDays: 1.5 }).success).toBe(false);
    const empty = productSchema.safeParse({ ...valid, defaultWarrantyDays: NaN });
    expect(empty.error?.issues[0]?.message).toBe("Ingresa la duración en días");
  });
});

describe("productUpdateSchema", () => {
  it("has no code field at all (inmutable tras crear)", () => {
    expect("code" in productUpdateSchema.shape).toBe(false);
  });
});
