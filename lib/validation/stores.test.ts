import { describe, expect, it } from "vitest";
import { storeSchema } from "./stores";

describe("storeSchema", () => {
  const valid = {
    code: "T-001",
    name: "Tienda Centro",
    address: "",
    phone: "",
    countryCode: "ve",
    timezone: "America/Caracas",
  };

  it("accepts a valid store and uppercases the country code", () => {
    const parsed = storeSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.countryCode).toBe("VE");
  });

  it("rejects an empty code", () => {
    expect(storeSchema.safeParse({ ...valid, code: "" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(storeSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects a country code that isn't 2 letters", () => {
    expect(storeSchema.safeParse({ ...valid, countryCode: "VEN" }).success).toBe(false);
    expect(storeSchema.safeParse({ ...valid, countryCode: "1E" }).success).toBe(false);
  });

  it("rejects an empty timezone", () => {
    expect(storeSchema.safeParse({ ...valid, timezone: "" }).success).toBe(false);
  });
});
