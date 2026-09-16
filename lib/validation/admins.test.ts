import { describe, expect, it } from "vitest";
import { inviteAdminSchema } from "./admins";

describe("inviteAdminSchema", () => {
  const valid = { email: "Admin@Test.com", fullName: "Ana Admin" };

  it("accepts a valid invite and normalizes the email", () => {
    const parsed = inviteAdminSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("admin@test.com");
  });

  it("rejects an invalid email", () => {
    expect(inviteAdminSchema.safeParse({ ...valid, email: "no-es-un-correo" }).success).toBe(false);
  });

  it("rejects an empty full name", () => {
    expect(inviteAdminSchema.safeParse({ ...valid, fullName: "" }).success).toBe(false);
  });
});
