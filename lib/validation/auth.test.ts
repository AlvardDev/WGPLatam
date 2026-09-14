import { describe, expect, it } from "vitest";
import { loginSchema, updatePasswordSchema } from "./auth";

describe("loginSchema", () => {
  it("accepts a valid email and non-empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const result = updatePasswordSchema.safeParse({ password: "short", confirmPassword: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = updatePasswordSchema.safeParse({
      password: "longenough1",
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts matching, long-enough passwords", () => {
    const result = updatePasswordSchema.safeParse({
      password: "longenough1",
      confirmPassword: "longenough1",
    });
    expect(result.success).toBe(true);
  });
});
