"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LocationMap = dynamic(
  () => import("@/components/location-map").then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-lg border border-border bg-muted" />
    ),
  },
);

type Result = { ok: true } | { ok: false; error: string };
type Point = { lat: number; lng: number };

/**
 * Map pin + radius editor shared by the branch office and department pins.
 * Posts FormData with lat / long / radius to `save`.
 */
export function LocationEditor({
  initialPoint,
  fallbackCenter,
  initialRadius,
  save,
  successMessage,
  submitLabel = "Simpan",
  alwaysDirty = false,
  onSaved,
  extraActions,
}: {
  /** null = not set yet; the map opens on `fallbackCenter`. */
  initialPoint: Point | null;
  fallbackCenter: Point;
  initialRadius: number;
  save: (fd: FormData) => Promise<Result>;
  successMessage: string;
  submitLabel?: string;
  /** Allow saving an untouched pin (e.g. a department adopting the branch pin as a start). */
  alwaysDirty?: boolean;
  onSaved?: (v: { lat: number; lng: number; radius: number }) => void;
  extraActions?: ReactNode;
}) {
  const [initialMarker] = useState(() => initialPoint ?? fallbackCenter);
  const [marker, setMarker] = useState(initialMarker);
  const [radius, setRadius] = useState(initialRadius || 100);
  // Bumped only by the "pakai lokasi saya" button so the map recenters on the
  // new pin. Deliberately NOT bumped on manual-edit typing or map drag/click —
  // those must not fight the user's viewport.
  const [recenterKey, setRecenterKey] = useState(0);
  const [baseline, setBaseline] = useState({
    lat: initialMarker.lat,
    lng: initialMarker.lng,
    radius: initialRadius || 100,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    alwaysDirty ||
    marker.lat !== baseline.lat ||
    marker.lng !== baseline.lng ||
    radius !== baseline.radius;

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Perangkat tidak mendukung lokasi.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRecenterKey((k) => k + 1);
      },
      () => toast.error("Gagal mengambil lokasi."),
    );
  }

  async function action() {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("lat", String(marker.lat));
      fd.set("long", String(marker.lng));
      fd.set("radius", String(radius));
      const r = await save(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const saved = { lat: marker.lat, lng: marker.lng, radius };
      setBaseline(saved);
      onSaved?.(saved);
      toast.success(successMessage);
    } catch (e) {
      console.error(e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={action} className="space-y-4">
      <LocationMap
        mode="edit"
        center={initialMarker}
        marker={marker}
        radiusMeters={radius}
        recenterKey={recenterKey}
        onMarkerChange={setMarker}
      />

      <div className="space-y-1.5">
        <Button type="button" variant="secondary" size="sm" onClick={useMyLocation}>
          <LocateFixed className="size-4" aria-hidden="true" />
          Pakai lokasi saya sekarang
        </Button>
        <p className="font-mono text-sm text-foreground">
          {marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Edit manual</summary>
          <div className="mt-2 flex flex-wrap gap-3">
            <Input
              type="number"
              step="any"
              aria-label="Lintang"
              value={marker.lat}
              onChange={(e) => {
                if (e.target.value === "") return;
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setMarker({ ...marker, lat: n });
              }}
              className="w-40"
            />
            <Input
              type="number"
              step="any"
              aria-label="Bujur"
              value={marker.lng}
              onChange={(e) => {
                if (e.target.value === "") return;
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setMarker({ ...marker, lng: n });
              }}
              className="w-40"
            />
          </div>
        </details>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Radius</span>
          <span className="text-sm text-muted-foreground">{radius} m</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={20}
            max={500}
            step={5}
            aria-label="Radius"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <Input
            type="number"
            min={20}
            max={5000}
            aria-label="Radius dalam meter"
            value={radius}
            onChange={(e) => {
              if (e.target.value === "") return;
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setRadius(n);
            }}
            className="w-24"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Karyawan di luar radius tetap bisa absen, tapi wajib mengisi alasan.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!dirty || busy}>
          {submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}
