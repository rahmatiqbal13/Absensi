"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

export type LatLng = { lat: number; lng: number };

// Leaflet's default marker icons resolve to broken relative URLs under a
// bundler. The PNGs that ship with the pinned `leaflet` package are copied to
// `public/leaflet/` (see that folder) and referenced by absolute path so the
// marker renders identically under `next dev` (Turbopack) and a production
// build.
const ICON = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function LocationMap({
  mode,
  center,
  radiusMeters,
  marker,
  userPosition,
  onMarkerChange,
  recenterKey,
  className,
}: {
  mode: "edit" | "view";
  center: LatLng;
  radiusMeters: number;
  marker: LatLng;
  userPosition?: { lat: number; lng: number; accuracy?: number };
  onMarkerChange?: (p: LatLng) => void;
  /** Bump to re-center the map on the current marker (e.g. "pakai lokasi saya").
   * A dedicated key avoids fighting the user during drag/click. */
  recenterKey?: number | string;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const userRef = useRef<L.CircleMarker | null>(null);
  const [failed, setFailed] = useState(false);
  const onMarkerChangeRef = useRef(onMarkerChange);
  useEffect(() => {
    onMarkerChangeRef.current = onMarkerChange;
  }, [onMarkerChange]);

  // Init once. Wrapped in try/catch: a Leaflet failure (bad tile host, missing
  // marker asset, jsdom) must degrade to a static fallback, never throw out of
  // the effect and take the whole page's error boundary with it.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    let map: L.Map | undefined;
    try {
      map = L.map(elRef.current, {
        center: [center.lat, center.lng],
        zoom: 16,
        scrollWheelZoom: mode === "edit",
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const m = L.marker([marker.lat, marker.lng], {
        draggable: mode === "edit",
        icon: ICON,
      }).addTo(map);
      const c = L.circle([marker.lat, marker.lng], {
        radius: radiusMeters,
        color: "#2563eb",
        weight: 1,
        fillOpacity: 0.1,
      }).addTo(map);
      markerRef.current = m;
      circleRef.current = c;

      if (mode === "edit") {
        m.on("dragend", () => {
          const p = m.getLatLng();
          c.setLatLng(p);
          onMarkerChangeRef.current?.({ lat: p.lat, lng: p.lng });
        });
        map.on("click", (e: L.LeafletMouseEvent) => {
          m.setLatLng(e.latlng);
          c.setLatLng(e.latlng);
          onMarkerChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
      }

      mapRef.current = map;
    } catch (err) {
      console.error("LocationMap: init failed", err);
      map?.remove();
      mapRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: record the init failure so a static fallback renders
      setFailed(true);
      return;
    }
    return () => {
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      userRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to prop changes.
  useEffect(() => {
    markerRef.current?.setLatLng([marker.lat, marker.lng]);
    circleRef.current?.setLatLng([marker.lat, marker.lng]);
  }, [marker.lat, marker.lng]);

  useEffect(() => {
    circleRef.current?.setRadius(radiusMeters);
  }, [radiusMeters]);

  // Recenter only on an explicit key bump (not on marker drag/click), so the
  // "pakai lokasi saya" button can pull a far-away pin back into view.
  const didMountRecenter = useRef(false);
  useEffect(() => {
    if (recenterKey === undefined) return;
    if (!didMountRecenter.current) {
      didMountRecenter.current = true;
      return;
    }
    mapRef.current?.setView([marker.lat, marker.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  const uLat = userPosition?.lat;
  const uLng = userPosition?.lng;

  useEffect(() => {
    if (!mapRef.current) return;
    if (uLat === undefined || uLng === undefined) {
      userRef.current?.remove();
      userRef.current = null;
      return;
    }
    const ll: L.LatLngExpression = [uLat, uLng];
    if (userRef.current) {
      userRef.current.setLatLng(ll);
    } else {
      userRef.current = L.circleMarker(ll, {
        radius: 6,
        color: "#fff",
        weight: 2,
        fillColor: "#16a34a",
        fillOpacity: 1,
      }).addTo(mapRef.current);
    }
  }, [uLat, uLng]);

  return (
    <div className={cn("relative h-64 w-full", className)}>
      <div
        ref={elRef}
        className={cn(
          "h-full w-full overflow-hidden rounded-lg border border-border",
          "[&_.leaflet-tile-pane]:dark:brightness-90 [&_.leaflet-tile-pane]:dark:contrast-90 [&_.leaflet-tile-pane]:dark:invert [&_.leaflet-tile-pane]:dark:hue-rotate-180",
        )}
      />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-border bg-muted px-4 text-center text-sm text-muted-foreground">
          Peta tidak dapat dimuat. Masukkan koordinat secara manual di bawah.
        </div>
      )}
    </div>
  );
}
