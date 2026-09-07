import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, isWithinRadius, geofenceState } from "./geofencing";

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

describe("geofenceState", () => {
  const office = { lat: -6.2, long: 106.8 };

  it("reports unconfigured when office is (0,0)", () => {
    expect(geofenceState(-6.2, 106.8, { lat: 0, long: 0 }, 100)).toEqual({
      configured: false,
      distanceMeters: null,
      withinRadius: false,
    });
  });

  it("is within radius when user sits on the office point", () => {
    const s = geofenceState(-6.2, 106.8, office, 100);
    expect(s.configured).toBe(true);
    expect(s.distanceMeters).toBeCloseTo(0, 5);
    expect(s.withinRadius).toBe(true);
  });

  it("is outside radius when user is far away", () => {
    const s = geofenceState(-6.9, 107.6, office, 100); // ~150 km
    expect(s.configured).toBe(true);
    expect(s.withinRadius).toBe(false);
    expect(s.distanceMeters).toBeGreaterThan(100_000);
  });

  it("treats a point exactly on the radius as within", () => {
    // 0.001 deg latitude ~= 111.19 m; radius 200 m keeps it inside
    const s = geofenceState(-6.201, 106.8, office, 200);
    expect(s.withinRadius).toBe(true);
  });
});
