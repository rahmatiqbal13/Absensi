"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { MapPin, Crosshair, LoaderCircle, TriangleAlert, Info } from "lucide-react";
import { MetricTile } from "@/components/metric-tile";
import { useGeolocation } from "@/lib/geo/use-geolocation";
import { geofenceState } from "@/lib/attendance/geofencing";
import { formatDistance, walkingMinutes } from "@/lib/geo/format-distance";

const LocationMap = dynamic(
  () => import("@/components/location-map").then((m) => m.LocationMap),
  { ssr: false, loading: () => <div className="h-40 w-full animate-pulse rounded-lg border border-border bg-muted" /> },
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

  // `.configured` is derived once from geofenceState so the (0,0) sentinel
  // lives in exactly one place.
  const configured = geofenceState(office.lat, office.long, office, office.radius).configured;
  const geo =
    position != null
      ? geofenceState(position.lat, position.lng, office, office.radius)
      : { configured, distanceMeters: null, withinRadius: false };

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

  const lowAccuracy = accuracy != null && accuracy > 100;

  return (
    <div className="space-y-3">
      {geo.configured && (
        <LocationMap
          mode="view"
          center={{ lat: office.lat, lng: office.long }}
          marker={{ lat: office.lat, lng: office.long }}
          radiusMeters={office.radius}
          userPosition={position ? { lat: position.lat, lng: position.lng, accuracy: accuracy ?? undefined } : undefined}
          className="h-40"
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

      {lowAccuracy && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
          Sinyal GPS lemah — coba ke area terbuka.
        </p>
      )}

      {!geo.configured && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3 shrink-0" aria-hidden="true" />
          Radius kantor belum diatur admin.
        </p>
      )}

      {status === "denied" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
          Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser, atau isi alasan untuk tetap absen.
        </p>
      )}

      {status === "unavailable" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
          GPS tidak tersedia. Isi alasan untuk tetap absen.
        </p>
      )}
    </div>
  );
}
