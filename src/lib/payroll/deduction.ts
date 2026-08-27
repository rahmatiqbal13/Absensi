import { round2 } from "./round";
import { jakartaMinutesOfDay, scheduleMinutes } from "./minutes";

export type AttendanceRowLite = {
  status: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
};

export type ScheduleLite = {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
};

export type RincianHarianEntry = {
  tanggal: string;
  jenis: "kerja" | "alpa" | "cuti" | "luar_kantor";
  status: string | null;
  menit_terlambat: number;
  menit_pulang_cepat: number;
  potongan: number;
  catatan?: string;
};

export type LeaveCoverage = { covered: boolean; jenis?: string };

export function leaveCoversDate(
  approvedLeaves: { tanggalMulai: string; tanggalSelesai: string; jenis: string }[],
  tanggal: string,
): LeaveCoverage {
  for (const lv of approvedLeaves) {
    if (tanggal >= lv.tanggalMulai && tanggal <= lv.tanggalSelesai) {
      return { covered: true, jenis: lv.jenis };
    }
  }
  return { covered: false };
}

export function dayDeduction(params: {
  tanggal: string;
  attendanceRow: AttendanceRowLite | null;
  schedule: ScheduleLite;
  dailyWage: number;
  leave: LeaveCoverage;
}): RincianHarianEntry {
  const { tanggal, attendanceRow, schedule, dailyWage, leave } = params;

  const entry: RincianHarianEntry = {
    tanggal,
    jenis: "kerja",
    status: attendanceRow?.status ?? null,
    menit_terlambat: 0,
    menit_pulang_cepat: 0,
    potongan: 0,
  };

  if (leave.covered) {
    return { ...entry, jenis: "cuti", status: null, catatan: `cuti_${leave.jenis}` };
  }
  if (attendanceRow === null) {
    return { ...entry, jenis: "alpa", status: "alpa", potongan: dailyWage };
  }
  if (attendanceRow.status === "di_luar_lokasi") {
    return { ...entry, jenis: "luar_kantor", potongan: 0 };
  }
  if (attendanceRow.status === "alpa") {
    return { ...entry, jenis: "alpa", potongan: dailyWage };
  }

  const workMinutes = scheduleMinutes(schedule.jamPulang) - scheduleMinutes(schedule.jamMasuk);
  const lateThreshold = scheduleMinutes(schedule.jamMasuk) + schedule.toleransiMenit;
  const endScheduled = scheduleMinutes(schedule.jamPulang);

  let potonganMasuk = 0;
  if (attendanceRow.jam_masuk) {
    entry.menit_terlambat = Math.max(0, jakartaMinutesOfDay(attendanceRow.jam_masuk) - lateThreshold);
    potonganMasuk = workMinutes > 0 ? (dailyWage * entry.menit_terlambat) / workMinutes : 0;
  }

  let potonganPulang = 0;
  if (attendanceRow.jam_pulang === null) {
    entry.catatan = "pulang tidak tercatat";
  } else {
    entry.menit_pulang_cepat = Math.max(0, endScheduled - jakartaMinutesOfDay(attendanceRow.jam_pulang));
    potonganPulang = workMinutes > 0 ? (dailyWage * entry.menit_pulang_cepat) / workMinutes : 0;
  }

  if (workMinutes <= 0) {
    // A schedule row with jamPulang <= jamMasuk yields no positive work window,
    // so both proportional deductions silently become 0. Flag it on the payslip
    // rather than hiding a bad schedule as a clean day.
    entry.catatan = entry.catatan
      ? `${entry.catatan}; jadwal kerja tidak valid`
      : "jadwal kerja tidak valid";
  }

  entry.potongan = round2(round2(potonganMasuk) + round2(potonganPulang));
  return entry;
}
