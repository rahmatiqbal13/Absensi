import { describe, it, expect } from "vitest";
import { deriveAccent, deriveAccentDark, contrastRatio, accentWarning, normalizeHex } from "./accent";

describe("normalizeHex", () => {
  it("upper-cases and keeps the hash", () => {
    expect(normalizeHex("#2563eb")).toBe("#2563EB");
  });
  it("throws on a bad hex", () => {
    expect(() => normalizeHex("2563eb")).toThrow();
    expect(() => normalizeHex("#12345")).toThrow();
    expect(() => normalizeHex("#gggggg")).toThrow();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black vs white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
  it("is 1 for a colour against itself", () => {
    expect(contrastRatio("#2563EB", "#2563EB")).toBeCloseTo(1, 5);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#2563EB", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#2563EB"), 5);
  });
});

describe("deriveAccent", () => {
  it("picks white foreground for a dark accent (blue-600)", () => {
    const d = deriveAccent("#2563EB");
    expect(d.primary).toBe("#2563EB");
    expect(d.primaryForeground).toBe("#FFFFFF");
    expect(d.ring).toBe("#2563EB");
  });
  it("picks near-black foreground for a light accent (amber-300)", () => {
    expect(deriveAccent("#FCD34D").primaryForeground).toBe("#0A0A0A");
  });
  it("normalizes the input", () => {
    expect(deriveAccent("#2563eb").primary).toBe("#2563EB");
  });
});

describe("deriveAccentDark", () => {
  it("passes a light accent through unchanged", () => {
    expect(deriveAccentDark("#FCD34D").primary).toBe("#FCD34D");
  });
  it("lightens a dark accent until it reads on the dark surface", () => {
    const d = deriveAccentDark("#1E3A5F"); // navy
    expect(d.primary).not.toBe("#1E3A5F");
    expect(contrastRatio(d.primary, "#1C1C1C")).toBeGreaterThanOrEqual(4.5);
  });
  it("gives a lightened accent a dark foreground", () => {
    expect(deriveAccentDark("#1B4332").primaryForeground).toBe("#0A0A0A");
  });
  it("normalizes its input", () => {
    expect(deriveAccentDark("#fcd34d").primary).toBe("#FCD34D");
  });
});

describe("accentWarning", () => {
  it("returns null when one of black/white clears 4.5:1", () => {
    expect(accentWarning("#2563EB")).toBeNull();
    expect(accentWarning("#FCD34D")).toBeNull();
  });
  it("warns for a mid-tone where neither text colour clears 4.5:1", () => {
    // #787878: vs white=4.42, vs black=4.48, both < 4.5
    expect(accentWarning("#787878")).toMatch(/kontras/i);
  });
});
