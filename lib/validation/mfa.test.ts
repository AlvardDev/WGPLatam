import { describe, expect, it } from "vitest";
import { totpCodeSchema } from "./mfa";

describe("totpCodeSchema", () => {
  it("accepts a 6-digit code", () => {
    expect(totpCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
  });

  it("rejects a code with letters", () => {
    expect(totpCodeSchema.safeParse({ code: "12345a" }).success).toBe(false);
  });

  it("rejects a code with fewer than 6 digits", () => {
    expect(totpCodeSchema.safeParse({ code: "1234" }).success).toBe(false);
  });

  it("rejects a code with spaces", () => {
    expect(totpCodeSchema.safeParse({ code: "123 456" }).success).toBe(false);
  });
});
