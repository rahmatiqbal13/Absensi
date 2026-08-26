export type AttendanceStatus =
  | "tepat_waktu"
  | "terlambat"
  | "pulang_cepat"
  | "alpa"
  | "di_luar_lokasi";

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
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
