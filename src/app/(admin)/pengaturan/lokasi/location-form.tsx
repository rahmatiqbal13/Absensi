"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { walkingMinutes } from "@/lib/geo/format-distance";
import { cn } from "@/lib/utils";

const LocationMap = dynamic(
  () => import("@/components/location-map").then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-lg border border-border bg-muted" />
    ),
  },
);

export type BranchLocation = {
  id: string;
  nama: string;
  alamat: string | null;
  lat: number;
  long: number;
  radius: number;
};

type Result = { ok: true } | { ok: false; error: string };

export function LocationForm({
  branch,
  fallbackCenter,
  saveBranchLocation,
}: {
  branch: BranchLocation;
  fallbackCenter: { lat: number; lng: number };
  saveBranchLocation: (branchId: string, fd: FormData) => Promise<Result>;
}) {
  const configured = !(branch.lat === 0 && branch.long === 0);
  const [initialMarker] = useState(() =>
    configured ? { lat: branch.lat, lng: branch.long } : fallbackCenter,
  );
  const initialRadius = branch.radius || 100;

  const [marker, setMarker] = useState(initialMarker);
  const [radius, setRadius] = useState(initialRadius);
  const [baseline, setBaseline] = useState({
    lat: initialMarker.lat,
    lng: initialMarker.lng,
    radius: initialRadius,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    marker.lat !== baseline.lat ||
    marker.lng !== baseline.lng ||
    radius !== baseline.radius;

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
      const r = await saveBranchLocation(branch.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBaseline({ lat: marker.lat, lng: marker.lng, radius });
      toast.success("Lokasi kantor tersimpan.");
    } catch (e) {
      console.error(e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{branch.nama}</CardTitle>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              configured
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            {configured
              ? `Aktif · ${radius} m · ${walkingMinutes(radius)}`
              : "Belum diatur"}
          </span>
        </div>
        {branch.alamat && (
          <p className="text-sm text-muted-foreground">{branch.alamat}</p>
        )}
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <LocationMap
            mode="edit"
            center={initialMarker}
            marker={marker}
            radiusMeters={radius}
            onMarkerChange={setMarker}
          />

          <div className="space-y-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={useMyLocation}
            >
              <LocateFixed className="size-4" aria-hidden="true" />
              Pakai lokasi saya sekarang
            </Button>
            <p className="font-mono text-sm text-foreground">
              {marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Edit manual
              </summary>
              <div className="mt-2 flex flex-wrap gap-3">
                <Input
                  type="number"
                  step="any"
                  aria-label="Lintang"
                  value={marker.lat}
                  onChange={(e) =>
                    setMarker({ ...marker, lat: Number(e.target.value) })
                  }
                  className="w-40"
                />
                <Input
                  type="number"
                  step="any"
                  aria-label="Bujur"
                  value={marker.lng}
                  onChange={(e) =>
                    setMarker({ ...marker, lng: Number(e.target.value) })
                  }
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
                onChange={(e) => setRadius(Number(e.target.value))}
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

          <Button type="submit" disabled={!dirty || busy}>
            Simpan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
