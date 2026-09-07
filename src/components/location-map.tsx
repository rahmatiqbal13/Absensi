"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { cn } from "@/lib/utils";

export type LatLng = { lat: number; lng: number };

// Leaflet's default marker icons resolve to broken relative URLs under a
// bundler, so point them at the images that ship with the pinned `leaflet`
// package. Next resolves these static image imports to hashed asset URLs
// (StaticImageData), so use the `.src` string.
const ICON = L.icon({
  iconUrl: iconUrl.src,
  iconRetinaUrl: iconRetinaUrl.src,
  shadowUrl: shadowUrl.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export function LocationMap({
  mode,
  center,
  radiusMeters,
  marker,
  userPosition,
  onMarkerChange,
  className,
}: {
  mode: "edit" | "view";
  center: LatLng;
  radiusMeters: number;
  marker: LatLng;
  userPosition?: { lat: number; lng: number; accuracy?: number };
  onMarkerChange?: (p: LatLng) => void;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const userRef = useRef<L.CircleMarker | null>(null);
  const onMarkerChangeRef = useRef(onMarkerChange);
  useEffect(() => {
    onMarkerChangeRef.current = onMarkerChange;
  }, [onMarkerChange]);

  // Init once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
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
    return () => {
      map.remove();
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

  useEffect(() => {
    if (!mapRef.current) return;
    if (!userPosition) {
      userRef.current?.remove();
      userRef.current = null;
      return;
    }
    const ll: L.LatLngExpression = [userPosition.lat, userPosition.lng];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPosition?.lat, userPosition?.lng]);

  return (
    <div
      ref={elRef}
      className={cn(
        "h-64 w-full overflow-hidden rounded-lg border border-border",
        "[&_.leaflet-tile-pane]:dark:brightness-90 [&_.leaflet-tile-pane]:dark:contrast-90 [&_.leaflet-tile-pane]:dark:invert [&_.leaflet-tile-pane]:dark:hue-rotate-180",
        className,
      )}
    />
  );
}
