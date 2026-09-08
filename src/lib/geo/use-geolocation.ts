"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoStatus = "prompt" | "watching" | "granted" | "denied" | "unavailable";

export type GeoReading = {
  position: { lat: number; lng: number } | null;
  accuracy: number | null;
  status: GeoStatus;
  error: string | null;
  refresh: () => void;
};

/** Shared geolocation options — the watch here and one-shot `getCurrentPosition`
 * callers (e.g. Absen's clock-panel) must use the SAME options so a fresh fix
 * isn't coarser than the one already displayed. */
export const OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 10000,
};

export function useGeolocation(enabled = true): GeoReading {
  const supported = typeof navigator !== "undefined" && !!navigator.geolocation;
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoStatus>(supported ? "prompt" : "unavailable");
  const [error, setError] = useState<string | null>(supported ? null : "Perangkat tidak mendukung lokasi.");
  const watchId = useRef<number | null>(null);

  const onOk = useCallback((p: GeolocationPosition) => {
    setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
    setAccuracy(p.coords.accuracy);
    setStatus("granted");
    setError(null);
  }, []);

  const onErr = useCallback((e: GeolocationPositionError) => {
    if (e.code === e.PERMISSION_DENIED) {
      setStatus("denied");
      setError("Izin lokasi ditolak.");
    } else {
      setStatus("unavailable");
      setError("GPS tidak tersedia. Coba lagi di area terbuka.");
    }
  }, []);

  useEffect(() => {
    if (!enabled || !supported) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("watching");
    watchId.current = navigator.geolocation.watchPosition(onOk, onErr, OPTS);
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled, supported, onOk, onErr]);

  const refresh = useCallback(() => {
    if (!supported) return;
    navigator.geolocation.getCurrentPosition(onOk, onErr, OPTS);
  }, [supported, onOk, onErr]);

  return { position, accuracy, status, error, refresh };
}
