import { describe, expect, it } from "vitest";
import { locationFlags, parsePoint, readGpsQuality, qrFarFromOffice } from "./location-flags";

const NOW = new Date("2026-11-18T10:00:00Z");
const OFFICE = { lat: -6.2, long: 106.8 };

describe("locationFlags", () => {
  it("returns nothing for a fresh, accurate fix", () => {
    expect(locationFlags({ ...OFFICE, accuracyMeters: 15, fixAgeSeconds: 5, now: NOW })).toEqual([]);
  });

  it("does not flag when the client sent no quality data", () => {
    expect(locationFlags({ ...OFFICE, now: NOW })).toEqual([]);
  });

  it("flags accuracy worse than 100 m", () => {
    expect(locationFlags({ ...OFFICE, accuracyMeters: 100, now: NOW })).toEqual([]);
    expect(locationFlags({ ...OFFICE, accuracyMeters: 101, now: NOW })).toEqual(["akurasi_rendah"]);
  });

  it("flags a fix older than 2 minutes", () => {
    expect(locationFlags({ ...OFFICE, fixAgeSeconds: 120, now: NOW })).toEqual([]);
    expect(locationFlags({ ...OFFICE, fixAgeSeconds: 121, now: NOW })).toEqual(["lokasi_basi"]);
  });

  it("flags an implausibly fast move since the previous submit", () => {
    // ~111 km north in 10 minutes ≈ 667 km/h.
    const previous = { lat: -7.2, long: 106.8, at: new Date(NOW.getTime() - 10 * 60_000) };
    expect(locationFlags({ ...OFFICE, previous, now: NOW })).toEqual(["lompatan_lokasi"]);
  });

  it("does not flag a plausible commute", () => {
    // ~111 km in 8 hours.
    const previous = { lat: -7.2, long: 106.8, at: new Date(NOW.getTime() - 8 * 3_600_000) };
    expect(locationFlags({ ...OFFICE, previous, now: NOW })).toEqual([]);
  });

  it("ignores GPS noise under 2 km even when the submits are seconds apart", () => {
    const previous = { lat: -6.21, long: 106.8, at: new Date(NOW.getTime() - 5_000) };
    expect(locationFlags({ ...OFFICE, previous, now: NOW })).toEqual([]);
  });

  it("can report several flags at once", () => {
    expect(locationFlags({ ...OFFICE, accuracyMeters: 500, fixAgeSeconds: 600, now: NOW })).toEqual([
      "akurasi_rendah",
      "lokasi_basi",
    ]);
  });
});

describe("parsePoint", () => {
  it("parses PostgREST point text", () => {
    expect(parsePoint("(-6.2,106.8)")).toEqual({ lat: -6.2, long: 106.8 });
  });
  it("rejects anything else", () => {
    expect(parsePoint(null)).toBeNull();
    expect(parsePoint("-6.2,106.8")).toBeNull();
    expect(parsePoint({ x: 1, y: 2 })).toBeNull();
  });
});

describe("readGpsQuality", () => {
  it("reads numbers and drops junk", () => {
    const fd = new FormData();
    fd.set("akurasi", "42.5");
    fd.set("usiaFix", "abc");
    expect(readGpsQuality(fd)).toEqual({ accuracyMeters: 42.5, fixAgeSeconds: undefined });
  });
  it("treats negatives as missing", () => {
    const fd = new FormData();
    fd.set("akurasi", "-1");
    fd.set("usiaFix", "3");
    expect(readGpsQuality(fd)).toEqual({ accuracyMeters: undefined, fixAgeSeconds: 3 });
  });
});

describe("qrFarFromOffice", () => {
  it("flags a QR scanned far outside the office (a forwarded photo of the kiosk)", () => {
    expect(qrFarFromOffice({ distanceMeters: 12_000, radiusMeters: 100, accuracyMeters: 20 })).toBe(true);
  });

  it("does not flag indoor GPS drift next to the kiosk", () => {
    // 350 m off with a 100 m radius but the phone itself reports ±80 m: within radius + error + margin.
    expect(qrFarFromOffice({ distanceMeters: 350, radiusMeters: 100, accuracyMeters: 80 })).toBe(false);
    expect(qrFarFromOffice({ distanceMeters: 50, radiusMeters: 100 })).toBe(false);
  });

  it("does not flag without a position", () => {
    expect(qrFarFromOffice({ distanceMeters: null, radiusMeters: 100 })).toBe(false);
  });
});
