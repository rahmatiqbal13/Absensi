import { describe, it, expect } from "vitest";
import { validateRecapRange } from "./validate-range";

describe("validateRecapRange", () => {
  it("accepts a valid range", () => {
    expect(validateRecapRange("2026-08-01", "2026-08-31")).toEqual({
      ok: true,
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("rejects from > to", () => {
    const r = validateRecapRange("2026-08-01", "2026-07-01");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sebelum/);
  });

  it("rejects a range longer than 366 days", () => {
    const r = validateRecapRange("2020-01-01", "2026-01-01");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/maksimal/);
  });

  it("rejects an impossible date that passes the regex", () => {
    expect(validateRecapRange("2026-13-45", "2026-12-31")).toEqual({
      ok: false,
      error: "Tanggal tidak valid.",
    });
  });

  it("rejects a rolled-over date (2026-02-30)", () => {
    expect(validateRecapRange("2026-02-30", "2026-03-31")).toEqual({
      ok: false,
      error: "Tanggal tidak valid.",
    });
  });

  it("rejects a wrong format", () => {
    const r = validateRecapRange("08/01/2026", "2026-08-31");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/format YYYY-MM-DD/);
  });

  it("rejects null inputs with a format error", () => {
    const r = validateRecapRange(null, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/format YYYY-MM-DD/);
  });
});
