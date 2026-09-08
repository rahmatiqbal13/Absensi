import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The Leaflet map is loaded via next/dynamic — stub both so the panel renders
// synchronously without a real map.
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="map" /> }));
vi.mock("@/components/location-map", () => ({ LocationMap: () => <div data-testid="map" /> }));

const geoReading = {
  position: null as { lat: number; lng: number } | null,
  accuracy: null as number | null,
  status: "watching" as "prompt" | "watching" | "granted" | "denied" | "unavailable",
  error: null as string | null,
  refresh: vi.fn(),
};
vi.mock("@/lib/geo/use-geolocation", () => ({
  useGeolocation: () => geoReading,
}));

import { ProximityPanel } from "./proximity-panel";

const CONFIGURED = { lat: -6.2, long: 106.8, radius: 100 };
const UNCONFIGURED = { lat: 0, long: 0, radius: 100 };

describe("ProximityPanel geolocation-state notes", () => {
  it("shows the 'belum diatur admin' note when the office geofence is unconfigured", () => {
    geoReading.position = null;
    geoReading.accuracy = null;
    geoReading.status = "watching";
    render(<ProximityPanel office={UNCONFIGURED} onGeoChange={vi.fn()} />);
    expect(screen.getByText(/radius kantor belum diatur admin/i)).toBeInTheDocument();
  });

  it("shows the amber low-accuracy note when GPS accuracy is worse than 100 m", () => {
    geoReading.position = { lat: -6.2001, lng: 106.8001 };
    geoReading.accuracy = 180;
    geoReading.status = "granted";
    render(<ProximityPanel office={CONFIGURED} onGeoChange={vi.fn()} />);
    expect(screen.getByText(/sinyal gps lemah/i)).toBeInTheDocument();
  });

  it("shows the denied note when location permission is denied", () => {
    geoReading.position = null;
    geoReading.accuracy = null;
    geoReading.status = "denied";
    render(<ProximityPanel office={CONFIGURED} onGeoChange={vi.fn()} />);
    expect(screen.getByText(/izin lokasi ditolak/i)).toBeInTheDocument();
  });
});
