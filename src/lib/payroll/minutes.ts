// Minutes since Asia/Jakarta midnight for an instant given as an ISO
// timestamptz string. Pinned to Asia/Jakarta via Intl rather than
// Date.prototype.getHours(), for the reason documented at length in
// src/lib/attendance/status.ts: getHours() reads the EXECUTING PROCESS's
// local timezone, which is wrong on a UTC-default cloud/serverless server.
const JAKARTA_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function jakartaMinutesOfDay(iso: string): number {
  const parts = JAKARTA_TIME_FORMATTER.formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Minutes since midnight for a work_schedules time value ("HH:MM" or "HH:MM:SS").
export function scheduleMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
