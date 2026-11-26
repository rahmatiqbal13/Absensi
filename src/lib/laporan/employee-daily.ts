import { jakartaMinutesOfDay, scheduleMinutes } from "@/lib/payroll/minutes";
import { approvedOvertimeMinutes, restDayOvertimeMinutes, type ApprovedOvertime } from "@/lib/payroll/overtime";
import type { Roster } from "@/lib/schedule/roster";
import { leaveJenisLabel } from "@/lib/leave/labels";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PULANG_WINDOW_MIN } from "@/lib/mesin/merge-day";
import { LOCATION_FLAG_LABELS, isLocationFlag, type LocationFlag } from "@/lib/attendance/location-flags";

/**
 * One row per calendar day for a single employee's attendance report: the
 * schedule that applied, the actual clock-in / clock-out times and what they
 * mean. Day precedence mirrors attendance-recap.ts (non-working day / holiday,
 * pre-join, leave, no record = alpa) — except a day the employee actually
 * clocked in is always shown with its times, even on a holiday or weekend.
 */
export type DailyKind = "hadir" | "alpa" | "cuti" | "libur" | "bukan_hari_kerja" | "belum_bekerja";

export type DailyRow = {
  tanggal: string;
  kind: DailyKind;
  /** Attendance status when there is a row (tepat_waktu, terlambat, ...). */
  status: string | null;
  jamMasuk: string | null;
  jamPulang: string | null;
  durasiMenit: number | null;
  menitTerlambat: number;
  menitPulangCepat: number;
  menitLembur: number;
  /** Holiday name, leave type, or "Di luar hari kerja". */
  keterangan: string | null;
  /** The employee's own note (e.g. reason for being out of radius). */
  catatan: string | null;
  /** GPS warnings on the clock-in or clock-out of this day (0046), deduplicated. */
  flagLokasi: LocationFlag[];
  /** Rostered shift name for this day (0059), when on a roster. */
  shift?: string | null;
  /** An approved lembur request covers this day (0058). */
  lemburDisetujui?: boolean;
  /** Where jam masuk / pulang came from: gps · qr (aplikasi) · mesin (fingerprint) · koreksi (HR). */
  metodeMasuk?: string | null;
  metodePulang?: string | null;
  /** Every raw machine scan of this day (ISO, ascending) — HR only (mesin_scans RLS). */
  scansMesin?: string[];
  /**
   * Only one of the two clock events exists: "masuk" = clocked in, never out
   * (flagged once the day is over); "pulang" = only a clock-out (no jam masuk,
   * or the lone time falls in the clock-out window, see PULANG_WINDOW_MIN).
   * Still counts as hadir, but the work time is taken as 0 (Unesa's rule) and
   * the row gets its own colour so HR can follow it up / correct it.
   */
  absenSekali?: "masuk" | "pulang";
};

export const ABSEN_SEKALI_LABEL = { masuk: "Hanya absen masuk", pulang: "Hanya absen pulang" } as const;

/** Keterangan prefixed with the single-clock warning, for exports. */
export function keteranganLengkap(r: Pick<DailyRow, "absenSekali" | "keterangan">): string {
  return [r.absenSekali ? ABSEN_SEKALI_LABEL[r.absenSekali] : null, r.keterangan].filter(Boolean).join(" · ");
}

export const LEMBUR_LIBUR_NOTE = "Lembur hari libur (dicatat, belum dihitung ke gaji)";
export const LEMBUR_TANPA_ABSEN_NOTE = "Lembur disetujui, tidak ada absen";

export type DailySchedule = {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  hariKerja: number[];
  hitungLembur?: boolean;
};

export type DailyAttendance = {
  status: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  catatan: string | null;
  flag_lokasi_masuk?: string[] | null;
  flag_lokasi_pulang?: string[] | null;
  metode_masuk?: string | null;
  metode_pulang?: string | null;
};

/** Full label for a clock-in / clock-out source; null when there is no time. Rows from before 0031 count as GPS. */
export function sumberLabel(metode: string | null | undefined, jam: string | null): string | null {
  if (!jam) return null;
  switch (metode ?? "gps") {
    case "mesin":
      return "Mesin finger";
    case "qr":
      return "Aplikasi (QR)";
    case "koreksi":
      return "Koreksi HR";
    default:
      return "Aplikasi (GPS)";
  }
}

/** Short form for tight columns (web table, PDF). */
export function sumberSingkat(metode: string | null | undefined, jam: string | null): string | null {
  if (!jam) return null;
  return { mesin: "Mesin", qr: "QR", koreksi: "Koreksi" }[metode ?? ""] ?? "GPS";
}

function mergeFlags(att: DailyAttendance): LocationFlag[] {
  return [...new Set([...(att.flag_lokasi_masuk ?? []), ...(att.flag_lokasi_pulang ?? [])])].filter(isLocationFlag);
}

export function locationFlagsLabel(flags: readonly LocationFlag[]): string {
  return flags.map((f) => LOCATION_FLAG_LABELS[f]).join("; ");
}

function* eachDate(from: string, to: string): Generator<string> {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function buildEmployeeDaily(input: {
  from: string;
  to: string;
  schedule: DailySchedule | null;
  holidays: Map<string, string>;
  attendance: Map<string, DailyAttendance>;
  leaves: { tanggalMulai: string; tanggalSelesai: string; jenis: string }[];
  joinDate: string | null;
  /** Approved lembur windows by date (0058); overtime counts only inside them. */
  approvedOvertime?: Map<string, ApprovedOvertime[]>;
  /** Shift roster (0059): that day's shift times / working day, or libur. */
  roster?: Roster;
  /** Jakarta date (YYYY-MM-DD); a missing clock-out is only flagged before this day. Defaults to now. */
  today?: string;
}): DailyRow[] {
  const { from, to, schedule, holidays, attendance, leaves, joinDate, roster } = input;
  const today = input.today ?? toJakartaDateOnly(new Date());
  const workingDow = new Set(schedule?.hariKerja ?? []);
  const rows: DailyRow[] = [];

  for (const tanggal of eachDate(from, to)) {
    const dow = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
    const rostered = roster?.get(tanggal);
    const onRoster = roster?.has(tanggal) ?? false;
    // A rostered shift makes the day a working day with its own times (even on
    // a weekend or holiday); a rostered libur makes it a day off.
    const isWorkday = onRoster ? rostered != null : workingDow.has(dow);
    const holiday = onRoster && rostered ? null : holidays.get(tanggal) ?? null;
    const day = rostered ?? schedule;
    const lateThreshold = day ? scheduleMinutes(day.jamMasuk) + day.toleransiMenit : null;
    const endMin = day ? scheduleMinutes(day.jamPulang) : null;
    const leave = leaves.find((l) => tanggal >= l.tanggalMulai && tanggal <= l.tanggalSelesai) ?? null;
    const att = attendance.get(tanggal) ?? null;
    const approvals = input.approvedOvertime?.get(tanggal);
    const lemburDisetujui = (approvals?.length ?? 0) > 0;

    const base: DailyRow = {
      tanggal,
      kind: "hadir",
      status: null,
      jamMasuk: null,
      jamPulang: null,
      durasiMenit: null,
      menitTerlambat: 0,
      menitPulangCepat: 0,
      menitLembur: 0,
      keterangan: null,
      catatan: null,
      flagLokasi: [],
      ...(lemburDisetujui ? { lemburDisetujui } : {}),
    };

    if (att && att.status !== "alpa") {
      const masuk = att.jam_masuk ? jakartaMinutesOfDay(att.jam_masuk) : null;
      const pulang = att.jam_pulang ? jakartaMinutesOfDay(att.jam_pulang) : null;
      const scheduled = isWorkday && !holiday;
      // A lone time inside the clock-out window is a clock-out the machine
      // import stored as jam masuk (it always takes the earliest scan).
      const loneIsPulang =
        att.jam_masuk != null && !att.jam_pulang && masuk != null && endMin != null && masuk >= endMin - PULANG_WINDOW_MIN;
      const absenSekali: DailyRow["absenSekali"] =
        loneIsPulang || (!att.jam_masuk && att.jam_pulang)
          ? "pulang"
          : att.jam_masuk && !att.jam_pulang && tanggal < today
            ? "masuk"
            : undefined;
      const jamMasuk = loneIsPulang ? null : att.jam_masuk;
      const jamPulang = loneIsPulang ? att.jam_masuk : att.jam_pulang;
      const metodeMasukRaw = loneIsPulang ? null : att.metode_masuk;
      const metodePulangRaw = loneIsPulang ? att.metode_masuk : att.metode_pulang;
      const masukMin = loneIsPulang ? null : masuk;
      const pulangMin = loneIsPulang ? masuk : pulang;
      const status = loneIsPulang ? (endMin != null && pulangMin! < endMin ? "pulang_cepat" : "tepat_waktu") : att.status;
      const dayOff = holiday ? `Libur: ${holiday}` : !isWorkday ? (onRoster ? "Libur (roster)" : "Di luar hari kerja") : null;
      rows.push({
        ...base,
        status: att.status === "di_luar_lokasi" ? att.status : status,
        jamMasuk,
        jamPulang,
        durasiMenit: absenSekali
          ? 0
          : att.jam_masuk && att.jam_pulang
            ? Math.max(0, Math.round((Date.parse(att.jam_pulang) - Date.parse(att.jam_masuk)) / 60_000))
            : null,
        menitTerlambat: scheduled && masukMin != null && lateThreshold != null ? Math.max(0, masukMin - lateThreshold) : 0,
        menitPulangCepat: scheduled && pulangMin != null && endMin != null ? Math.max(0, endMin - pulangMin) : 0,
        menitLembur: scheduled
          ? schedule?.hitungLembur
            ? approvedOvertimeMinutes(att.jam_pulang, (rostered ?? schedule).jamPulang, approvals)
            : 0
          : restDayOvertimeMinutes(att.jam_masuk, att.jam_pulang, approvals),
        keterangan: dayOff && lemburDisetujui ? `${dayOff} · ${LEMBUR_LIBUR_NOTE}` : dayOff,
        shift: isWorkday && rostered?.nama ? rostered.nama : null,
        catatan: att.catatan,
        flagLokasi: mergeFlags(att),
        metodeMasuk: jamMasuk ? metodeMasukRaw ?? "gps" : null,
        metodePulang: jamPulang ? metodePulangRaw ?? "gps" : null,
        ...(absenSekali ? { absenSekali } : {}),
      });
      continue;
    }

    // Approved lembur on a day off, but no clock-in: flag it so HR notices.
    const withNoShow = (k: string | null) =>
      lemburDisetujui ? [k, LEMBUR_TANPA_ABSEN_NOTE].filter(Boolean).join(" · ") : k;
    if (!isWorkday) rows.push({ ...base, kind: "bukan_hari_kerja", keterangan: withNoShow(onRoster ? "Libur (roster)" : null) });
    else if (holiday) rows.push({ ...base, kind: "libur", keterangan: withNoShow(holiday) });
    else if (joinDate && tanggal < joinDate) rows.push({ ...base, kind: "belum_bekerja" });
    else if (leave) rows.push({ ...base, kind: "cuti", keterangan: leaveJenisLabel(leave.jenis) });
    else rows.push({ ...base, kind: "alpa", status: "alpa", catatan: att?.catatan ?? null });
  }
  return rows;
}

export type DailySummary = {
  hariKerja: number;
  hadir: number;
  tepatWaktu: number;
  terlambat: number;
  pulangCepat: number;
  diLuarLokasi: number;
  alpa: number;
  cuti: number;
  menitTerlambat: number;
  menitPulangCepat: number;
  menitLembur: number;
  menitKerja: number;
  /** Days present with only one clock event (work time counted as 0). */
  absenSekali: number;
};

export function summarizeDaily(rows: readonly DailyRow[]): DailySummary {
  const s: DailySummary = {
    hariKerja: 0, hadir: 0, tepatWaktu: 0, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0,
    alpa: 0, cuti: 0, menitTerlambat: 0, menitPulangCepat: 0, menitLembur: 0, menitKerja: 0, absenSekali: 0,
  };
  for (const r of rows) {
    if (r.kind === "alpa" || r.kind === "cuti" || (r.kind === "hadir" && r.keterangan == null)) s.hariKerja += 1;
    if (r.kind === "alpa") s.alpa += 1;
    if (r.kind === "cuti") s.cuti += 1;
    if (r.kind !== "hadir") continue;
    s.hadir += 1;
    if (r.status === "tepat_waktu") s.tepatWaktu += 1;
    if (r.status === "terlambat") s.terlambat += 1;
    if (r.status === "pulang_cepat") s.pulangCepat += 1;
    if (r.status === "di_luar_lokasi") s.diLuarLokasi += 1;
    s.menitTerlambat += r.menitTerlambat;
    s.menitPulangCepat += r.menitPulangCepat;
    s.menitLembur += r.menitLembur;
    s.menitKerja += r.durasiMenit ?? 0;
    if (r.absenSekali) s.absenSekali += 1;
  }
  return s;
}

/** "08:57:12" in WIB, or "—". */
export function formatJamWib(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(new Date(iso))
    .replace(/\./g, ":");
}

/** Seconds between jam masuk and jam pulang; 0 on a single-clock day; null otherwise when either is missing. */
export function durasiDetik(r: Pick<DailyRow, "jamMasuk" | "jamPulang" | "absenSekali">): number | null {
  if (r.absenSekali) return 0;
  if (!r.jamMasuk || !r.jamPulang) return null;
  return Math.max(0, Math.floor((Date.parse(r.jamPulang) - Date.parse(r.jamMasuk)) / 1000));
}

/** 30425 -> "08:27:05" (hours are not capped at 24, so totals read "169:12:30"). */
export function formatDurasiJms(detik: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(detik / 3600))}:${p(Math.floor((detik % 3600) / 60))}:${p(detik % 60)}`;
}

/** 30425 -> "8 jam 27 menit 5 detik". */
export function formatDurasiPanjang(detik: number): string {
  return `${Math.floor(detik / 3600)} jam ${Math.floor((detik % 3600) / 60)} menit ${detik % 60} detik`;
}

/** "8j 05m", or "—". */
export function formatDurasiSingkat(menit: number | null): string {
  if (menit == null) return "—";
  return `${Math.floor(menit / 60)}j ${String(menit % 60).padStart(2, "0")}m`;
}

const KIND_LABEL: Record<DailyKind, string> = {
  hadir: "Hadir",
  alpa: "Alpa",
  cuti: "Cuti",
  libur: "Libur",
  bukan_hari_kerja: "Bukan hari kerja",
  belum_bekerja: "Belum bekerja",
};
const STATUS_LABEL: Record<string, string> = {
  tepat_waktu: "Tepat waktu",
  terlambat: "Terlambat",
  pulang_cepat: "Pulang cepat",
  di_luar_lokasi: "Di luar lokasi",
  alpa: "Alpa",
};

export function dailyStatusLabel(r: DailyRow): string {
  return r.kind === "hadir" ? STATUS_LABEL[r.status ?? ""] ?? "Hadir" : KIND_LABEL[r.kind];
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel-friendly CSV (BOM + CRLF), same conventions as recap-csv.ts. */
export function employeeDailyToCsv(rows: readonly DailyRow[]): string {
  const header = [
    "Tanggal", "Status", "Jam Masuk", "Sumber Masuk", "Jam Pulang", "Sumber Pulang", "Durasi (menit)",
    "Terlambat (menit)", "Pulang Cepat (menit)", "Lembur (menit)", "Keterangan", "Catatan", "Peringatan Lokasi",
  ];
  const lines = [header.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.tanggal, dailyStatusLabel(r),
        r.jamMasuk ? formatJamWib(r.jamMasuk) : "", sumberLabel(r.metodeMasuk, r.jamMasuk) ?? "",
        r.jamPulang ? formatJamWib(r.jamPulang) : "", sumberLabel(r.metodePulang, r.jamPulang) ?? "",
        r.durasiMenit ?? "", r.menitTerlambat, r.menitPulangCepat, r.menitLembur,
        keteranganLengkap(r), r.catatan ?? "", locationFlagsLabel(r.flagLokasi),
      ].map(csvField).join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const HARI_SINGKAT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** "08:00–16:00, Sen, Sel, Rab, Kam, Jum" — working days listed Monday first. */
export function jadwalLabel(sched: Pick<DailySchedule, "jamMasuk" | "jamPulang" | "hariKerja">): string {
  const hari = [1, 2, 3, 4, 5, 6, 0].filter((d) => sched.hariKerja.includes(d)).map((d) => HARI_SINGKAT[d]).join(", ");
  return `${sched.jamMasuk}–${sched.jamPulang}, ${hari}`;
}
