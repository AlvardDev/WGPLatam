import { describe, expect, it } from "vitest";
import { customerSchema, serialLookupSchema } from "./warranties";

describe("serialLookupSchema", () => {
  it("accepts a non-empty code", () => {
    expect(serialLookupSchema.safeParse({ code: "ABC-001" }).success).toBe(true);
  });
  it("rejects an empty code", () => {
    expect(serialLookupSchema.safeParse({ code: "  " }).success).toBe(false);
  });
});

describe("customerSchema", () => {
  const valid = { name: "Ana Cliente", nationalId: "V-12345678", whatsapp: "+584121234567" };

  it("accepts a valid customer", () => {
    expect(customerSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(customerSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });
  it("rejects an empty national id", () => {
    expect(customerSchema.safeParse({ ...valid, nationalId: "" }).success).toBe(false);
  });
  it("rejects a whatsapp number without E.164 format", () => {
    expect(customerSchema.safeParse({ ...valid, whatsapp: "04121234567" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...valid, whatsapp: "+0412123" }).success).toBe(false);
  });
  it("accepts different valid E.164 numbers", () => {
    expect(customerSchema.safeParse({ ...valid, whatsapp: "+15551234567" }).success).toBe(true);
  });
});
