const km = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${km.format(Math.round(meters / 100) / 10)} km`;
}

export function walkingMinutes(meters: number): string {
  const minutes = Math.max(1, Math.round(meters / 80));
  return `± ${minutes} menit jalan kaki`;
}
