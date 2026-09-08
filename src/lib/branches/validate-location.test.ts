import { describe, it, expect } from "vitest";
import { validateLocationInput } from "./validate-location";

const ok = { lat: "-6.2", long: "106.816", radius: "120" };

describe("validateLocationInput", () => {
  it("accepts a valid point and radius", () => {
    expect(validateLocationInput(ok)).toEqual({
      ok: true,
      value: { lat: -6.2, long: 106.816, radius: 120 },
    });
  });

  it("rejects (0,0) as not chosen", () => {
    const r = validateLocationInput({ lat: "0", long: "0", radius: "100" });
    expect(r).toEqual({ ok: false, error: "Titik kantor belum dipilih di peta." });
  });

  it("rejects a lone zeroed latitude (a cleared field coerced to 0)", () => {
    const r = validateLocationInput({ lat: "0", long: "106.8", radius: "100" });
    expect(r).toEqual({ ok: false, error: "Titik kantor belum dipilih di peta." });
  });

  it("rejects a lone zeroed longitude (a cleared field coerced to 0)", () => {
    const r = validateLocationInput({ lat: "-6.2", long: "0", radius: "100" });
    expect(r).toEqual({ ok: false, error: "Titik kantor belum dipilih di peta." });
  });

  it("rejects latitude out of range", () => {
    expect(validateLocationInput({ ...ok, lat: "95" }).ok).toBe(false);
  });

  it("rejects longitude out of range", () => {
    expect(validateLocationInput({ ...ok, long: "200" }).ok).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(validateLocationInput({ ...ok, lat: "abc" }).ok).toBe(false);
    expect(validateLocationInput({ ...ok, lat: null }).ok).toBe(false);
  });

  it("rejects radius below 20", () => {
    expect(validateLocationInput({ ...ok, radius: "10" }).ok).toBe(false);
  });

  it("rejects radius above 5000", () => {
    expect(validateLocationInput({ ...ok, radius: "6000" }).ok).toBe(false);
  });

  it("rejects a non-integer radius", () => {
    expect(validateLocationInput({ ...ok, radius: "120.5" }).ok).toBe(false);
  });
});
