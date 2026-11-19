import { describe, it, expect } from "vitest";
import type { DailyRow } from "@/lib/laporan/employee-daily";
import { toRiwayatRecords } from "./records";

const row = (tanggal: string, kind: DailyRow["kind"], extra: Partial<DailyRow> = {}): DailyRow => ({
  tanggal, kind, status: kind === "hadir" ? "tepat_waktu" : null, jamMasuk: null, jamPulang: null, durasiMenit: null,
  menitTerlambat: 0, menitPulangCepat: 0, menitLembur: 0, keterangan: null, catatan: null, flagLokasi: [], ...extra,
});

describe("toRiwayatRecords", () => {
  it("keeps attended, absent, leave and holiday days, newest first, and drops weekends / pre-join days", () => {
    const out = toRiwayatRecords(
      [
        row("2026-11-01", "belum_bekerja"),
        row("2026-11-02", "hadir"),
        row("2026-11-03", "alpa"),
        row("2026-11-04", "cuti", { keterangan: "Cuti tahunan" }),
        row("2026-11-05", "libur", { keterangan: "Hari Guru" }),
        row("2026-11-07", "bukan_hari_kerja"),
      ],
      "2026-11-19",
    );
    expect(out.map((r) => [r.tanggal, r.kind])).toEqual([
      ["2026-11-05", "libur"],
      ["2026-11-04", "cuti"],
      ["2026-11-03", "alpa"],
      ["2026-11-02", "hadir"],
    ]);
    expect(out[0].keterangan).toBe("Libur: Hari Guru");
    expect(out[2].status).toBe("alpa");
  });

  it("doesn't call today 'Tidak absen' before the day is over", () => {
    expect(toRiwayatRecords([row("2026-11-19", "alpa")], "2026-11-19")).toEqual([]);
    expect(toRiwayatRecords([row("2026-11-19", "hadir")], "2026-11-19")).toHaveLength(1);
  });
});
