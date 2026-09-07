"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { MapPin, Crosshair, LoaderCircle } from "lucide-react";
import { MetricTile } from "@/components/metric-tile";
import { useGeolocation } from "@/lib/geo/use-geolocation";
import { geofenceState } from "@/lib/attendance/geofencing";
import { formatDistance, walkingMinutes } from "@/lib/geo/format-distance";

const LocationMap = dynamic(
  () => import("@/components/location-map").then((m) => m.LocationMap),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg border border-border bg-muted" /> },
);

export type BranchGeofence = { lat: number; long: number; radius: number };

export function ProximityPanel({
  office,
  onGeoChange,
}: {
  office: BranchGeofence;
  onGeoChange: (g: {
    status: ReturnType<typeof useGeolocation>["status"];
    configured: boolean;
    withinRadius: boolean;
    hasFix: boolean;
  }) => void;
}) {
  const { position, accuracy, status } = useGeolocation();

  const geo =
    position != null
      ? geofenceState(position.lat, position.lng, office, office.radius)
      : { configured: !(office.lat === 0 && office.long === 0), distanceMeters: null, withinRadius: false };

  useEffect(() => {
    onGeoChange({
      status,
      configured: geo.configured,
      withinRadius: geo.withinRadius,
      hasFix: position != null,
    });
  }, [status, geo.configured, geo.withinRadius, position, onGeoChange]);

  const accuracyStatus = accuracy == null ? "neutral" : accuracy <= 30 ? "good" : accuracy <= 100 ? "warn" : "bad";
  const distanceStatus = !geo.configured ? "neutral" : geo.withinRadius ? "good" : "bad";

  return (
    <div className="space-y-3">
      {geo.configured && (
        <LocationMap
          mode="view"
          center={{ lat: office.lat, lng: office.long }}
          marker={{ lat: office.lat, lng: office.long }}
          radiusMeters={office.radius}
          userPosition={position ? { lat: position.lat, lng: position.lng, accuracy: accuracy ?? undefined } : undefined}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <MetricTile
          label="Jarak ke kantor"
          value={geo.distanceMeters == null ? "—" : formatDistance(geo.distanceMeters)}
          hint={geo.distanceMeters == null ? undefined : walkingMinutes(geo.distanceMeters)}
          icon={MapPin}
          status={distanceStatus}
        />
        <MetricTile
          label="Akurasi GPS"
          value={accuracy == null ? "—" : `± ${Math.round(accuracy)} m`}
          icon={status === "watching" && position == null ? LoaderCircle : Crosshair}
          status={accuracyStatus}
        />
        <MetricTile
          label="Status"
          value={
            !geo.configured
              ? "Belum diatur"
              : position == null
                ? "Mencari…"
                : geo.withinRadius
                  ? "Dalam radius"
                  : "Luar radius"
          }
          status={!geo.configured ? "neutral" : position == null ? "neutral" : geo.withinRadius ? "good" : "bad"}
        />
      </div>

      {status === "watching" && position == null && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Memperbarui lokasi…
        </p>
      )}
    </div>
  );
}
