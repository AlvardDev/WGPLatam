import { describe, expect, it } from "vitest";
import {
  sellerRegisterSchema,
  sellerPasswordResetRequestSchema,
  resolvePasswordResetSchema,
} from "./registro";

describe("sellerRegisterSchema", () => {
  const valid = {
    email: "Vendedor@Test.com",
    fullName: "Ana Vendedora",
    storeId: "00000000-0000-0000-0000-000000000001",
    password: "contraseña-larga",
    confirmPassword: "contraseña-larga",
  };

  it("accepts a valid registration and normalizes the email", () => {
    const parsed = sellerRegisterSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("vendedor@test.com");
  });

  it("rejects mismatched passwords", () => {
    const parsed = sellerRegisterSchema.safeParse({ ...valid, confirmPassword: "otra-cosa" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a short password", () => {
    expect(sellerRegisterSchema.safeParse({ ...valid, password: "corta", confirmPassword: "corta" }).success).toBe(
      false,
    );
  });

  it("rejects a missing store", () => {
    expect(sellerRegisterSchema.safeParse({ ...valid, storeId: "" }).success).toBe(false);
  });

  it("rejects an empty full name", () => {
    expect(sellerRegisterSchema.safeParse({ ...valid, fullName: "" }).success).toBe(false);
  });
});

describe("sellerPasswordResetRequestSchema", () => {
  it("accepts a valid email", () => {
    expect(sellerPasswordResetRequestSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(sellerPasswordResetRequestSchema.safeParse({ email: "no-es-un-correo" }).success).toBe(false);
  });
});

describe("resolvePasswordResetSchema", () => {
  it("accepts a password with at least 8 characters", () => {
    expect(resolvePasswordResetSchema.safeParse({ password: "12345678" }).success).toBe(true);
  });

  it("rejects a short password", () => {
    expect(resolvePasswordResetSchema.safeParse({ password: "1234" }).success).toBe(false);
  });
});
