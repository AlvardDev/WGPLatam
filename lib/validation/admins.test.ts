import { describe, expect, it } from "vitest";
import { createAdminSchema } from "./admins";

describe("createAdminSchema", () => {
  const valid = { email: "Admin@Test.com", fullName: "Ana Admin", password: "supersecret123" };

  it("accepts valid data and normalizes the email", () => {
    const parsed = createAdminSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("admin@test.com");
  });

  it("rejects an invalid email", () => {
    expect(createAdminSchema.safeParse({ ...valid, email: "no-es-un-correo" }).success).toBe(false);
  });

  it("rejects an empty full name", () => {
    expect(createAdminSchema.safeParse({ ...valid, fullName: "" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(createAdminSchema.safeParse({ ...valid, password: "short1" }).success).toBe(false);
  });
});
