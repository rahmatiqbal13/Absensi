import { describe, it, expect } from "vitest";
import { mergeMachineDay, type ExistingDay } from "./merge-day";

const SCHED = { jam_masuk: "08:00:00", jam_pulang: "16:00:00", toleransi_terlambat_menit: 10 };
const at = (hms: string) => `2026-08-03T${hms}+07:00`;
const iso = (hms: string) => new Date(at(hms)).toISOString();

describe("mergeMachineDay", () => {
  it("first scan = masuk, last scan = pulang", () => {
    const r = mergeMachineDay(null, [at("07:55:01"), at("12:00:00"), at("16:05:09")], SCHED);
    expect(r).toMatchObject({ jamMasuk: iso("07:55:01"), jamPulang: iso("16:05:09"), metodeMasuk: "mesin", metodePulang: "mesin", status: "tepat_waktu", aksi: "baru" });
  });

  it("a single scan (or a double tap) is only jam masuk", () => {
    expect(mergeMachineDay(null, [at("08:20:00")], SCHED)).toMatchObject({ jamPulang: null, status: "terlambat" });
    expect(mergeMachineDay(null, [at("07:50:00"), at("07:50:30")], SCHED)).toMatchObject({ jamPulang: null });
  });

  it("combines with the app clock-in and keeps the earliest / latest", () => {
    const ex: ExistingDay = { jam_masuk: iso("07:40:00"), jam_pulang: null, metode_masuk: "gps", metode_pulang: null, status: "tepat_waktu" };
    const r = mergeMachineDay(ex, [at("07:58:00"), at("16:30:00")], SCHED);
    expect(r).toMatchObject({ jamMasuk: iso("07:40:00"), metodeMasuk: "gps", jamPulang: iso("16:30:00"), metodePulang: "mesin", aksi: "ubah" });
  });

  it("never overwrites a half HR corrected", () => {
    const ex: ExistingDay = { jam_masuk: iso("08:00:00"), jam_pulang: iso("16:00:00"), metode_masuk: "koreksi", metode_pulang: "koreksi", status: "tepat_waktu" };
    const r = mergeMachineDay(ex, [at("07:30:00"), at("18:00:00")], SCHED);
    expect(r).toMatchObject({ jamMasuk: iso("08:00:00"), jamPulang: iso("16:00:00"), aksi: "tetap" });
  });

  it("is idempotent: the same scans again change nothing", () => {
    const first = mergeMachineDay(null, [at("07:55:00"), at("16:05:00")], SCHED)!;
    const ex: ExistingDay = { jam_masuk: first.jamMasuk, jam_pulang: first.jamPulang, metode_masuk: "mesin", metode_pulang: "mesin", status: first.status };
    expect(mergeMachineDay(ex, [at("07:55:00"), at("16:05:00")], SCHED)?.aksi).toBe("tetap");
  });

  it("a later scan arriving alone becomes jam pulang (LAN bridge sends in pieces)", () => {
    const ex: ExistingDay = { jam_masuk: iso("07:55:00"), jam_pulang: null, metode_masuk: "mesin", metode_pulang: null, status: "tepat_waktu" };
    expect(mergeMachineDay(ex, [at("15:30:00")], SCHED)).toMatchObject({ jamPulang: iso("15:30:00"), status: "pulang_cepat" });
  });

  it("keeps di_luar_lokasi when the GPS half outside the geofence is kept", () => {
    const ex: ExistingDay = { jam_masuk: iso("07:40:00"), jam_pulang: null, metode_masuk: "gps", metode_pulang: null, status: "di_luar_lokasi" };
    expect(mergeMachineDay(ex, [at("16:10:00")], SCHED)?.status).toBe("di_luar_lokasi");
    // ...but not when the machine replaced that half.
    expect(mergeMachineDay(ex, [at("07:30:00"), at("16:10:00")], SCHED)?.status).toBe("tepat_waktu");
  });

  it("fills an alpa placeholder row", () => {
    const ex: ExistingDay = { jam_masuk: null, jam_pulang: null, metode_masuk: null, metode_pulang: null, status: "alpa" };
    expect(mergeMachineDay(ex, [at("07:59:59")], SCHED)).toMatchObject({ status: "tepat_waktu", aksi: "ubah" });
  });
});
