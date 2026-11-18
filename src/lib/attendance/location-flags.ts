import { haversineDistanceMeters } from "./geofencing";

/**
 * Signs that a GPS clock-in/out position may not be trustworthy. They never
 * block the employee — a browser cannot prove a position is genuine, and
 * honest phones produce all of these indoors — they mark the record so HR can
 * look at it. A verified kiosk QR proves presence, so QR submits are not flagged.
 */
export type LocationFlag = "akurasi_rendah" | "lokasi_basi" | "lompatan_lokasi";

/** The phone's own error radius above which its position says little. */
export const LOW_ACCURACY_METERS = 100;
/** A fix this old was taken somewhere the phone may no longer be. */
export const STALE_FIX_SECONDS = 120;
/** Faster than any ground travel between two submits on the same day. */
export const MAX_PLAUSIBLE_SPEED_KMH = 200;
/** Ignore short moves: GPS noise between two fixes can reach a few hundred metres. */
export const MIN_JUMP_METERS = 2_000;

export const LOCATION_FLAG_LABELS: Record<LocationFlag, string> = {
  akurasi_rendah: "Akurasi GPS rendah",
  lokasi_basi: "Lokasi GPS lama",
  lompatan_lokasi: "Pindah lokasi terlalu cepat",
};

export function isLocationFlag(v: unknown): v is LocationFlag {
  return typeof v === "string" && v in LOCATION_FLAG_LABELS;
}

export function locationFlags(input: {
  lat: number;
  long: number;
  /** Reported by the phone, in metres; null/undefined when not sent (older client). */
  accuracyMeters?: number | null;
  /** Age of the fix at submit, measured on the phone's own clock. */
  fixAgeSeconds?: number | null;
  /** Where and when the previous submit of the same day was made. */
  previous?: { lat: number; long: number; at: Date } | null;
  now: Date;
}): LocationFlag[] {
  const flags: LocationFlag[] = [];
  if (input.accuracyMeters != null && input.accuracyMeters > LOW_ACCURACY_METERS) flags.push("akurasi_rendah");
  if (input.fixAgeSeconds != null && input.fixAgeSeconds > STALE_FIX_SECONDS) flags.push("lokasi_basi");

  const prev = input.previous;
  if (prev) {
    const meters = haversineDistanceMeters(prev.lat, prev.long, input.lat, input.long);
    const hours = Math.max(input.now.getTime() - prev.at.getTime(), 60_000) / 3_600_000;
    if (meters >= MIN_JUMP_METERS && meters / 1000 / hours > MAX_PLAUSIBLE_SPEED_KMH) flags.push("lompatan_lokasi");
  }
  return flags;
}

/** Parses a Postgres `point` as PostgREST returns it: "(lat,long)". */
export function parsePoint(value: unknown): { lat: number; long: number } | null {
  if (typeof value !== "string") return null;
  const m = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(value);
  if (!m) return null;
  const lat = Number(m[1]);
  const long = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(long) ? { lat, long } : null;
}

/**
 * Reads the optional accuracy / fix-age fields of a clock FormData. Anything
 * missing, non-numeric or negative is treated as "not sent".
 */
export function readGpsQuality(formData: FormData): { accuracyMeters?: number; fixAgeSeconds?: number } {
  const num = (key: string) => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return { accuracyMeters: num("akurasi"), fixAgeSeconds: num("usiaFix") };
}
