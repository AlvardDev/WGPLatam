import { describe, expect, it } from "vitest";
import { createSellerSchema } from "./sellers";

describe("createSellerSchema", () => {
  const valid = {
    email: "Vendedor@Test.com",
    fullName: "Ana Vendedora",
    storeId: "00000000-0000-0000-0000-000000000001",
    password: "clave1234",
  };

  it("accepts valid data and normalizes the email", () => {
    const parsed = createSellerSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("vendedor@test.com");
  });

  it("rejects an invalid email", () => {
    expect(createSellerSchema.safeParse({ ...valid, email: "no-es-un-correo" }).success).toBe(false);
  });

  it("rejects an empty full name", () => {
    expect(createSellerSchema.safeParse({ ...valid, fullName: "" }).success).toBe(false);
  });

  it("rejects a missing store", () => {
    expect(createSellerSchema.safeParse({ ...valid, storeId: "" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(createSellerSchema.safeParse({ ...valid, password: "abc123" }).success).toBe(false);
  });
});
