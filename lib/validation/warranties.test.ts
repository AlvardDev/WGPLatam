import { describe, expect, it } from "vitest";
import {
  createTechnicalReportSchema,
  customerSchema,
  decideClaimSchema,
  decideCorrectionSchema,
  openClaimSchema,
  requestCorrectionSchema,
  serialLookupSchema,
  voidWarrantySchema,
} from "./warranties";

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

describe("requestCorrectionSchema", () => {
  const valid = {
    reason: "El cliente dictó mal su nombre al activar",
    customer: { name: "Ana Cliente", nationalId: "V-12345678", whatsapp: "+584121234567" },
  };

  it("accepts a valid correction request", () => {
    expect(requestCorrectionSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a reason shorter than 10 characters", () => {
    expect(requestCorrectionSchema.safeParse({ ...valid, reason: "muy corto" }).success).toBe(false);
  });
  it("rejects an invalid customer payload", () => {
    expect(
      requestCorrectionSchema.safeParse({ ...valid, customer: { ...valid.customer, whatsapp: "0412" } }).success,
    ).toBe(false);
  });
});

describe("decideCorrectionSchema", () => {
  it("accepts APPROVED/REJECTED with an optional note", () => {
    expect(decideCorrectionSchema.safeParse({ decision: "APPROVED" }).success).toBe(true);
    expect(decideCorrectionSchema.safeParse({ decision: "REJECTED", note: "no corresponde" }).success).toBe(true);
  });
  it("rejects an unknown decision", () => {
    expect(decideCorrectionSchema.safeParse({ decision: "MAYBE" }).success).toBe(false);
  });
});

describe("voidWarrantySchema", () => {
  it("accepts a valid reason", () => {
    expect(voidWarrantySchema.safeParse({ reason: "serial equivocado" }).success).toBe(true);
  });
  it("rejects a reason shorter than 5 characters", () => {
    expect(voidWarrantySchema.safeParse({ reason: "abcd" }).success).toBe(false);
  });
  it("rejects an empty reason", () => {
    expect(voidWarrantySchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});

describe("openClaimSchema", () => {
  it("accepts a valid reason without description", () => {
    expect(openClaimSchema.safeParse({ reason: "producto no enciende" }).success).toBe(true);
  });
  it("accepts a valid reason with description", () => {
    expect(openClaimSchema.safeParse({ reason: "producto no enciende", description: "desde ayer" }).success).toBe(
      true,
    );
  });
  it("rejects a reason shorter than 5 characters", () => {
    expect(openClaimSchema.safeParse({ reason: "abcd" }).success).toBe(false);
  });
});

describe("decideClaimSchema", () => {
  const valid = { status: "APPROVED" as const, decision: "se reemplaza", justification: "defecto de fábrica" };

  it("accepts a valid decision", () => {
    expect(decideClaimSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an unknown status", () => {
    expect(decideClaimSchema.safeParse({ ...valid, status: "MAYBE" }).success).toBe(false);
  });
  it("rejects a missing decision", () => {
    expect(decideClaimSchema.safeParse({ ...valid, decision: "" }).success).toBe(false);
  });
  it("rejects a missing justification", () => {
    expect(decideClaimSchema.safeParse({ ...valid, justification: "" }).success).toBe(false);
  });
});

describe("createTechnicalReportSchema", () => {
  const valid = { diagnosis: "batería dañada", result: "falla confirmada", decision: "reemplazo" };

  it("accepts the required fields only", () => {
    expect(createTechnicalReportSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts optional fields", () => {
    expect(
      createTechnicalReportSchema.safeParse({
        ...valid,
        testsPerformed: "prueba de carga",
        observations: "sin daño físico",
        justification: "cumple garantía",
      }).success,
    ).toBe(true);
  });
  it("rejects a missing diagnosis", () => {
    expect(createTechnicalReportSchema.safeParse({ ...valid, diagnosis: "" }).success).toBe(false);
  });
  it("rejects a missing result", () => {
    expect(createTechnicalReportSchema.safeParse({ ...valid, result: "" }).success).toBe(false);
  });
});
