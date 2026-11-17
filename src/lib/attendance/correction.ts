import {
  mergeAttendanceStatus,
  resolveClockInStatus,
  resolveClockOutStatus,
  type AttendanceStatus,
} from "./status";

/** How far back an employee may ask for a correction. HR has no such limit. */
export const EMPLOYEE_CORRECTION_MAX_DAYS_BACK = 31;
export const ALASAN_MAX = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Wall-clock time on a WIB calendar day as an ISO instant (WIB is fixed UTC+7, no DST). */
export function jakartaInstant(tanggal: string, hhmm: string): string {
  return new Date(`${tanggal}T${hhmm}:00+07:00`).toISOString();
}

function shiftDate(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CorrectionInput = {
  tanggal: string;
  jamMasuk: string; // HH:MM, WIB
  jamPulang: string; // HH:MM, WIB, or "" when not (yet) known
  alasan: string;
};

export type ValidCorrection = {
  tanggal: string;
  jamMasukIso: string;
  jamPulangIso: string | null;
  alasan: string;
};

export function validateCorrectionInput(
  input: CorrectionInput,
  ctx: { now: Date; today: string; maxDaysBack?: number },
): { ok: true; value: ValidCorrection } | { ok: false; error: string } {
  const tanggal = input.tanggal.trim();
  const jamMasuk = input.jamMasuk.trim();
  const jamPulang = input.jamPulang.trim();
  const alasan = input.alasan.trim();

  if (!DATE_RE.test(tanggal) || Number.isNaN(Date.parse(`${tanggal}T00:00:00Z`))) {
    return { ok: false, error: "Tanggal tidak valid." };
  }
  if (tanggal > ctx.today) return { ok: false, error: "Tanggal tidak boleh di masa depan." };
  if (ctx.maxDaysBack != null && tanggal < shiftDate(ctx.today, -ctx.maxDaysBack)) {
    return {
      ok: false,
      error: `Koreksi hanya bisa diajukan untuk ${ctx.maxDaysBack} hari terakhir. Hubungi HR untuk tanggal lebih lama.`,
    };
  }
  if (!TIME_RE.test(jamMasuk)) return { ok: false, error: "Jam masuk wajib diisi (format JJ:MM)." };
  if (jamPulang && !TIME_RE.test(jamPulang)) return { ok: false, error: "Format jam pulang tidak valid." };
  if (jamPulang && jamPulang <= jamMasuk) {
    return { ok: false, error: "Jam pulang harus setelah jam masuk." };
  }
  if (!alasan) return { ok: false, error: "Alasan koreksi wajib diisi." };
  if (alasan.length > ALASAN_MAX) return { ok: false, error: `Alasan maksimal ${ALASAN_MAX} karakter.` };

  const jamMasukIso = jakartaInstant(tanggal, jamMasuk);
  const jamPulangIso = jamPulang ? jakartaInstant(tanggal, jamPulang) : null;
  const nowMs = ctx.now.getTime();
  if (Date.parse(jamMasukIso) > nowMs || (jamPulangIso && Date.parse(jamPulangIso) > nowMs)) {
    return { ok: false, error: "Jam tidak boleh di masa depan." };
  }

  return { ok: true, value: { tanggal, jamMasukIso, jamPulangIso, alasan } };
}

/**
 * Status for a corrected day, using the same rules as clock-in/out. An approved
 * correction means the approver vouches for the employee's presence, so the
 * geofence is treated as satisfied (never `di_luar_lokasi`).
 */
export function correctedStatus(params: {
  jamMasukIso: string;
  jamPulangIso: string | null;
  schedule: { jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number };
}): AttendanceStatus {
  const masuk = resolveClockInStatus({
    clockInTime: new Date(params.jamMasukIso),
    scheduledStart: params.schedule.jam_masuk.slice(0, 5),
    toleranceMinutes: params.schedule.toleransi_terlambat_menit,
    withinRadius: true,
  });
  if (!params.jamPulangIso) return masuk;
  const pulang = resolveClockOutStatus({
    clockOutTime: new Date(params.jamPulangIso),
    scheduledEnd: params.schedule.jam_pulang.slice(0, 5),
    withinRadius: true,
  });
  return mergeAttendanceStatus(masuk, pulang);
}

const HHMM_WIB = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23", // never "24:05"
});

/** ISO instant -> "HH:MM" in WIB (for prefilling time inputs). */
export function toJakartaHHMM(iso: string | null): string | undefined {
  if (!iso) return undefined;
  return HHMM_WIB.format(new Date(iso));
}

export function correctionMinDate(today: string): string {
  return shiftDate(today, -EMPLOYEE_CORRECTION_MAX_DAYS_BACK);
}
