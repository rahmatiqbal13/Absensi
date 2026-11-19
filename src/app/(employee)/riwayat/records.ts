import type { DailyRow } from "@/lib/laporan/employee-daily";
import type { AttendanceStatus } from "@/lib/attendance/status";
import type { AttendanceRecord } from "./history-list";

const SHOWN = new Set<DailyRow["kind"]>(["hadir", "alpa", "cuti", "libur"]);

/**
 * The employee's own month, newest first. Working days without a clock-in
 * show as "Tidak absen"; weekends and days before joining are left out as
 * noise. Today isn't over, so it only appears once there is a clock-in.
 */
export function toRiwayatRecords(rows: readonly DailyRow[], today: string): AttendanceRecord[] {
  return rows
    .filter((r) => r.tanggal <= today && (r.tanggal === today ? r.kind === "hadir" : SHOWN.has(r.kind)))
    .map((r) => ({
      tanggal: r.tanggal,
      kind: r.kind as AttendanceRecord["kind"],
      jamMasuk: r.jamMasuk,
      jamPulang: r.jamPulang,
      status: (r.status ?? "alpa") as AttendanceStatus,
      catatan: r.catatan,
      keterangan: r.kind === "libur" ? `Libur: ${r.keterangan}` : r.keterangan,
    }))
    .reverse();
}
