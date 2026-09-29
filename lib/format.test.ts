import { describe, expect, it } from "vitest";
import { expiryInfo, formatDuration, initials, timeAgo } from "./format";

const now = new Date("2026-09-29T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("timeAgo", () => {
  it("uses relative wording for recent dates", () => {
    expect(timeAgo(ago(10_000), now)).toBe("ahora");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("hace 5 minutos");
    expect(timeAgo(ago(2 * 3_600_000), now)).toBe("hace 2 horas");
    expect(timeAgo(ago(86_400_000), now)).toBe("ayer");
  });
  it("falls back to the date after a week", () => {
    expect(timeAgo(ago(10 * 86_400_000), now)).not.toContain("hace");
  });
});

describe("formatDuration", () => {
  it("rounds to years and months only when it is exact-ish", () => {
    expect(formatDuration(365)).toBe("1 año");
    expect(formatDuration(730)).toBe("2 años");
    expect(formatDuration(180)).toBe("6 meses");
    expect(formatDuration(30)).toBe("1 mes");
    expect(formatDuration(45)).toBe("45 días");
    expect(formatDuration(1)).toBe("1 día");
  });
});

describe("expiryInfo", () => {
  it("classifies voided, expired, expiring soon and valid", () => {
    expect(expiryInfo(inDays(100), ago(1000), now).label).toBe("Anulada");
    expect(expiryInfo(ago(1000), null, now).variant).toBe("danger");
    expect(expiryInfo(inDays(12), null, now)).toEqual({ label: "Vence en 12 días", variant: "warning" });
    expect(expiryInfo(inDays(200), null, now).variant).toBe("success");
  });
});

describe("initials", () => {
  it("takes first and last word", () => {
    expect(initials("María José Pérez")).toBe("MP");
    expect(initials("ana")).toBe("A");
    expect(initials("  ")).toBe("?");
  });
});
