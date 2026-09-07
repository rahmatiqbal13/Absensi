export type LocationInput = {
  lat: FormDataEntryValue | null;
  long: FormDataEntryValue | null;
  radius: FormDataEntryValue | null;
};

export type LocationValue = { lat: number; long: number; radius: number };

export type LocationResult =
  | { ok: true; value: LocationValue }
  | { ok: false; error: string };

export function validateLocationInput(input: LocationInput): LocationResult {
  if (input.lat === null || input.long === null || input.radius === null) {
    return { ok: false, error: "Data lokasi tidak lengkap." };
  }

  const lat = Number(input.lat);
  const long = Number(input.long);
  const radius = Number(input.radius);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude tidak valid." };
  }
  if (!Number.isFinite(long) || long < -180 || long > 180) {
    return { ok: false, error: "Longitude tidak valid." };
  }
  if (lat === 0 && long === 0) {
    return { ok: false, error: "Titik kantor belum dipilih di peta." };
  }
  if (!Number.isInteger(radius) || radius < 20 || radius > 5000) {
    return { ok: false, error: "Radius harus antara 20 dan 5000 meter." };
  }
  return { ok: true, value: { lat, long, radius } };
}
