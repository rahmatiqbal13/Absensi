const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusMeters: number,
): boolean {
  return haversineDistanceMeters(lat1, lon1, lat2, lon2) <= radiusMeters;
}

export function isGeofenceConfigured(office: { lat: number; long: number }): boolean {
  return !(office.lat === 0 && office.long === 0);
}

export type GeofenceState = {
  configured: boolean;
  distanceMeters: number | null;
  withinRadius: boolean;
};

export function geofenceState(
  userLat: number,
  userLng: number,
  office: { lat: number; long: number },
  radiusMeters: number,
): GeofenceState {
  if (!isGeofenceConfigured(office)) {
    return { configured: false, distanceMeters: null, withinRadius: false };
  }
  const distanceMeters = haversineDistanceMeters(userLat, userLng, office.lat, office.long);
  return {
    configured: true,
    distanceMeters,
    withinRadius: distanceMeters <= radiusMeters,
  };
}
