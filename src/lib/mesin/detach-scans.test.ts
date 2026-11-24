import { describe, expect, it } from "vitest";
import { stripMachineDay } from "./detach-scans";

const SCHEDULE = { jam_masuk: "08:00:00", jam_pulang: "16:00:00", toleransi_terlambat_menit: 15 };
// 07:50 / 16:05 WIB on 2026-11-18
const MASUK = "2026-11-18T00:50:00.000Z";
const PULANG = "2026-11-18T09:05:00.000Z";

describe("stripMachineDay", () => {
  it("deletes a day that only came from the machine", () => {
    expect(
      stripMachineDay({ jam_masuk: MASUK, jam_pulang: PULANG, metode_masuk: "mesin", metode_pulang: "mesin", status: "hadir" }, SCHEDULE),
    ).toEqual({ aksi: "hapus" });
    expect(stripMachineDay({ jam_masuk: MASUK, jam_pulang: null, metode_masuk: "mesin", metode_pulang: null, status: "hadir" }, SCHEDULE)).toEqual({
      aksi: "hapus",
    });
  });

  it("leaves a day without machine times alone", () => {
    expect(stripMachineDay({ jam_masuk: MASUK, jam_pulang: PULANG, metode_masuk: "gps", metode_pulang: "qr", status: "hadir" }, SCHEDULE)).toEqual({
      aksi: "tetap",
    });
  });

  it("keeps the app half and drops the machine half", () => {
    const r = stripMachineDay({ jam_masuk: MASUK, jam_pulang: PULANG, metode_masuk: "gps", metode_pulang: "mesin", status: "hadir" }, SCHEDULE);
    expect(r).toMatchObject({ aksi: "ubah", values: { jam_masuk: MASUK, jam_pulang: null, metode_masuk: "gps", metode_pulang: null } });
  });

  it("keeps an HR correction", () => {
    const r = stripMachineDay({ jam_masuk: MASUK, jam_pulang: PULANG, metode_masuk: "mesin", metode_pulang: "koreksi", status: "hadir" }, SCHEDULE);
    expect(r).toEqual({
      aksi: "ubah",
      values: { jam_masuk: null, metode_masuk: null, jam_pulang: PULANG, metode_pulang: "koreksi", status: "hadir" },
    });
  });
});
