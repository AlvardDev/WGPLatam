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
  };

  it("accepts a valid product", () => {
    expect(productSchema.safeParse(valid).success).toBe(true);
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
});

describe("productUpdateSchema", () => {
  it("has no code field at all (inmutable tras crear)", () => {
    expect("code" in productUpdateSchema.shape).toBe(false);
  });
});
