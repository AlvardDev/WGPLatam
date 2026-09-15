import { describe, expect, it } from "vitest";
import { inviteSellerSchema } from "./sellers";

describe("inviteSellerSchema", () => {
  const valid = { email: "Vendedor@Test.com", fullName: "Ana Vendedora", storeId: "00000000-0000-0000-0000-000000000001" };

  it("accepts a valid invite and normalizes the email", () => {
    const parsed = inviteSellerSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("vendedor@test.com");
  });

  it("rejects an invalid email", () => {
    expect(inviteSellerSchema.safeParse({ ...valid, email: "no-es-un-correo" }).success).toBe(false);
  });

  it("rejects an empty full name", () => {
    expect(inviteSellerSchema.safeParse({ ...valid, fullName: "" }).success).toBe(false);
  });

  it("rejects a missing store", () => {
    expect(inviteSellerSchema.safeParse({ ...valid, storeId: "" }).success).toBe(false);
  });
});
