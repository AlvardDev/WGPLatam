import { describe, expect, it } from "vitest";
import { sellerPasswordResetRequestSchema, resolvePasswordResetSchema } from "./registro";

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
