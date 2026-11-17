import { jakartaMinutesOfDay, scheduleMinutes } from "@/lib/payroll/minutes";
import { overtimeMinutes } from "@/lib/payroll/overtime";
import { leaveJenisLabel } from "@/lib/leave/labels";

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
};

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
};

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
}): DailyRow[] {
  const { from, to, schedule, holidays, attendance, leaves, joinDate } = input;
  const workingDow = new Set(schedule?.hariKerja ?? []);
  const lateThreshold = schedule ? scheduleMinutes(schedule.jamMasuk) + schedule.toleransiMenit : null;
  const endMin = schedule ? scheduleMinutes(schedule.jamPulang) : null;
  const rows: DailyRow[] = [];

  for (const tanggal of eachDate(from, to)) {
    const dow = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
    const isWorkday = workingDow.has(dow);
    const holiday = holidays.get(tanggal) ?? null;
    const leave = leaves.find((l) => tanggal >= l.tanggalMulai && tanggal <= l.tanggalSelesai) ?? null;
    const att = attendance.get(tanggal) ?? null;

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
    };

    if (att && att.status !== "alpa") {
      const masuk = att.jam_masuk ? jakartaMinutesOfDay(att.jam_masuk) : null;
      const pulang = att.jam_pulang ? jakartaMinutesOfDay(att.jam_pulang) : null;
      const scheduled = isWorkday && !holiday;
      rows.push({
        ...base,
        status: att.status,
        jamMasuk: att.jam_masuk,
        jamPulang: att.jam_pulang,
        durasiMenit:
          att.jam_masuk && att.jam_pulang
            ? Math.max(0, Math.round((Date.parse(att.jam_pulang) - Date.parse(att.jam_masuk)) / 60_000))
            : null,
        menitTerlambat: scheduled && masuk != null && lateThreshold != null ? Math.max(0, masuk - lateThreshold) : 0,
        menitPulangCepat: scheduled && pulang != null && endMin != null ? Math.max(0, endMin - pulang) : 0,
        menitLembur:
          scheduled && schedule?.hitungLembur ? overtimeMinutes(att.jam_pulang, schedule.jamPulang) : 0,
        keterangan: holiday ? `Libur: ${holiday}` : !isWorkday ? "Di luar hari kerja" : null,
        catatan: att.catatan,
      });
      continue;
    }

    if (!isWorkday) rows.push({ ...base, kind: "bukan_hari_kerja" });
    else if (holiday) rows.push({ ...base, kind: "libur", keterangan: holiday });
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
};

export function summarizeDaily(rows: readonly DailyRow[]): DailySummary {
  const s: DailySummary = {
    hariKerja: 0, hadir: 0, tepatWaktu: 0, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0,
    alpa: 0, cuti: 0, menitTerlambat: 0, menitPulangCepat: 0, menitLembur: 0, menitKerja: 0,
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
  }
  return s;
}

/** "08:57" in WIB, or "—". */
export function formatJamWib(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(new Date(iso))
    .replace(".", ":");
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
    "Tanggal", "Status", "Jam Masuk", "Jam Pulang", "Durasi (menit)",
    "Terlambat (menit)", "Pulang Cepat (menit)", "Lembur (menit)", "Keterangan", "Catatan",
  ];
  const lines = [header.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.tanggal, dailyStatusLabel(r),
        r.jamMasuk ? formatJamWib(r.jamMasuk) : "", r.jamPulang ? formatJamWib(r.jamPulang) : "",
        r.durasiMenit ?? "", r.menitTerlambat, r.menitPulangCepat, r.menitLembur,
        r.keterangan ?? "", r.catatan ?? "",
      ].map(csvField).join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
