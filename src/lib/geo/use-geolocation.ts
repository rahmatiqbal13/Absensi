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

const OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 };

export function useGeolocation(enabled = true): GeoReading {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoStatus>("prompt");
  const [error, setError] = useState<string | null>(null);
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
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setError("Perangkat tidak mendukung lokasi.");
      return;
    }
    setStatus("watching");
    watchId.current = navigator.geolocation.watchPosition(onOk, onErr, OPTS);
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled, onOk, onErr]);

  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(onOk, onErr, OPTS);
  }, [onOk, onErr]);

  return { position, accuracy, status, error, refresh };
}
