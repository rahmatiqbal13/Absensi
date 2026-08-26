import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, isWithinRadius } from "./geofencing";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceMeters(-6.2, 106.8, -6.2, 106.8)).toBe(0);
  });

  it("computes the known distance between Jakarta and Bandung (~115km) within 2km tolerance", () => {
    const jakarta = { lat: -6.2088, lon: 106.8456 };
    const bandung = { lat: -6.9175, lon: 107.6191 };
    const distance = haversineDistanceMeters(jakarta.lat, jakarta.lon, bandung.lat, bandung.lon);
    expect(distance).toBeGreaterThan(113_000);
    expect(distance).toBeLessThan(117_000);
  });

  it("computes a small known distance (~111m for 0.001 degree latitude) within 5m tolerance", () => {
    const distance = haversineDistanceMeters(-6.2, 106.8, -6.201, 106.8);
    expect(distance).toBeGreaterThan(106);
    expect(distance).toBeLessThan(116);
  });
});

describe("isWithinRadius", () => {
  it("returns true when the point is inside the radius", () => {
    expect(isWithinRadius(-6.2, 106.8, -6.2, 106.8, 100)).toBe(true);
  });

  it("returns false when the point is outside the radius", () => {
    const jakarta = { lat: -6.2088, lon: 106.8456 };
    const bandung = { lat: -6.9175, lon: 107.6191 };
    expect(isWithinRadius(jakarta.lat, jakarta.lon, bandung.lat, bandung.lon, 100)).toBe(false);
  });

  it("treats exactly-on-the-boundary as within radius", () => {
    // ~100m north of the branch
    const distance = haversineDistanceMeters(-6.2, 106.8, -6.2009, 106.8);
    expect(isWithinRadius(-6.2, 106.8, -6.2009, 106.8, Math.ceil(distance))).toBe(true);
  });
});
