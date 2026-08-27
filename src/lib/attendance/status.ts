export type AttendanceStatus =
  | "tepat_waktu"
  | "terlambat"
  | "pulang_cepat"
  | "alpa"
  | "di_luar_lokasi";

// This module assumes all work schedules (jam_masuk / jam_pulang) are
// expressed in Asia/Jakarta wall-clock time (the app has no per-branch
// timezone column; a single-timezone assumption is correct for this
// project's scope). Hour/minute extraction is deliberately pinned to
// Asia/Jakarta via Intl.DateTimeFormat rather than Date.prototype.getHours()/
// getMinutes(), because those read the hour/minute in the EXECUTING
// PROCESS's local timezone, not any timezone implied by how the Date was
// constructed. On a server not configured with TZ=Asia/Jakarta (e.g. a
// UTC-default cloud/serverless deployment), getHours()/getMinutes() would
// silently compute attendance status up to 7 hours wrong. Pinning via Intl
// makes the result independent of the process's own TZ configuration.
const JAKARTA_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function minutesSinceMidnight(date: Date): number {
  const parts = JAKARTA_TIME_FORMATTER.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function parseHHMM(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function resolveClockInStatus(params: {
  clockInTime: Date;
  scheduledStart: string;
  toleranceMinutes: number;
  withinRadius: boolean;
}): "tepat_waktu" | "terlambat" | "di_luar_lokasi" {
  if (!params.withinRadius) return "di_luar_lokasi";

  const scheduledMinutes = parseHHMM(params.scheduledStart);
  const actualMinutes = minutesSinceMidnight(params.clockInTime);
  const lateBy = actualMinutes - scheduledMinutes;

  return lateBy > params.toleranceMinutes ? "terlambat" : "tepat_waktu";
}

export function resolveClockOutStatus(params: {
  clockOutTime: Date;
  scheduledEnd: string;
  withinRadius: boolean;
}): "tepat_waktu" | "pulang_cepat" | "di_luar_lokasi" {
  if (!params.withinRadius) return "di_luar_lokasi";

  const scheduledMinutes = parseHHMM(params.scheduledEnd);
  const actualMinutes = minutesSinceMidnight(params.clockOutTime);

  return actualMinutes < scheduledMinutes ? "pulang_cepat" : "tepat_waktu";
}

// Statuses that mean the employee showed up (attended) today, as opposed to
// `terlambat` (late but present, counted separately) or `alpa` (absent).
// Shared by the dashboard aggregation modules so the list is defined once.
export const PRESENT_STATUSES: string[] = ["tepat_waktu", "pulang_cepat", "di_luar_lokasi"];

const STATUS_PRIORITY: AttendanceStatus[] = [
  "di_luar_lokasi",
  "terlambat",
  "pulang_cepat",
  "tepat_waktu",
  "alpa",
];

export function mergeAttendanceStatus(
  clockInStatus: AttendanceStatus,
  clockOutStatus: AttendanceStatus,
): AttendanceStatus {
  const inRank = STATUS_PRIORITY.indexOf(clockInStatus);
  const outRank = STATUS_PRIORITY.indexOf(clockOutStatus);
  return inRank <= outRank ? clockInStatus : clockOutStatus;
}
