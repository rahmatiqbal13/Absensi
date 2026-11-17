import { describe, it, expect } from "vitest";
import {
  correctedStatus,
  correctionMinDate,
  jakartaInstant,
  toJakartaHHMM,
  validateCorrectionInput,
} from "./correction";

const now = new Date("2026-11-18T10:00:00+07:00");
const ctx = { now, today: "2026-11-18" };
const base = { tanggal: "2026-11-17", jamMasuk: "08:05", jamPulang: "17:00", alasan: "Lupa absen pulang" };

describe("jakartaInstant / toJakartaHHMM", () => {
  it("round-trips WIB wall-clock time", () => {
    const iso = jakartaInstant("2026-11-17", "08:05");
    expect(iso).toBe("2026-11-17T01:05:00.000Z");
    expect(toJakartaHHMM(iso)).toBe("08:05");
    expect(toJakartaHHMM(jakartaInstant("2026-11-17", "00:10"))).toBe("00:10");
    expect(toJakartaHHMM(null)).toBeUndefined();
  });
});

describe("validateCorrectionInput", () => {
  it("accepts a normal correction and converts to instants", () => {
    const r = validateCorrectionInput(base, ctx);
    expect(r).toEqual({
      ok: true,
      value: {
        tanggal: "2026-11-17",
        jamMasukIso: "2026-11-17T01:05:00.000Z",
        jamPulangIso: "2026-11-17T10:00:00.000Z",
        alasan: "Lupa absen pulang",
      },
    });
  });

  it("allows an empty jam pulang", () => {
    const r = validateCorrectionInput({ ...base, jamPulang: "" }, ctx);
    expect(r.ok && r.value.jamPulangIso).toBeNull();
  });

  it.each([
    [{ tanggal: "2026-11-19" }, /masa depan/],
    [{ tanggal: "17-11-2026" }, /Tanggal tidak valid/],
    [{ jamMasuk: "" }, /Jam masuk wajib/],
    [{ jamMasuk: "25:00" }, /Jam masuk wajib/],
    [{ jamPulang: "8pm" }, /jam pulang tidak valid/],
    [{ jamPulang: "08:00" }, /setelah jam masuk/],
    [{ jamPulang: "08:05" }, /setelah jam masuk/],
    [{ alasan: "   " }, /Alasan koreksi wajib/],
    [{ alasan: "x".repeat(501) }, /maksimal 500/],
  ])("rejects %o", (patch, msg) => {
    const r = validateCorrectionInput({ ...base, ...patch }, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(msg);
  });

  it("rejects times later today that haven't happened yet", () => {
    const r = validateCorrectionInput({ ...base, tanggal: "2026-11-18", jamMasuk: "08:00", jamPulang: "17:00" }, ctx);
    expect(!r.ok && r.error).toMatch(/Jam tidak boleh di masa depan/);
  });

  it("enforces the look-back window only when given", () => {
    const old = { ...base, tanggal: "2026-09-01" };
    expect(validateCorrectionInput(old, { ...ctx, maxDaysBack: 31 }).ok).toBe(false);
    expect(validateCorrectionInput(old, ctx).ok).toBe(true);
    expect(validateCorrectionInput({ ...base, tanggal: correctionMinDate("2026-11-18") }, { ...ctx, maxDaysBack: 31 }).ok).toBe(true);
  });
});

describe("correctedStatus", () => {
  const schedule = { jam_masuk: "08:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 10 };
  const at = (hhmm: string) => jakartaInstant("2026-11-17", hhmm);

  it("is tepat_waktu within tolerance and a full day", () => {
    expect(correctedStatus({ jamMasukIso: at("08:10"), jamPulangIso: at("17:00"), schedule })).toBe("tepat_waktu");
  });
  it("is terlambat past tolerance", () => {
    expect(correctedStatus({ jamMasukIso: at("08:11"), jamPulangIso: at("17:00"), schedule })).toBe("terlambat");
  });
  it("is pulang_cepat when leaving early", () => {
    expect(correctedStatus({ jamMasukIso: at("08:00"), jamPulangIso: at("16:30"), schedule })).toBe("pulang_cepat");
  });
  it("lets terlambat outrank pulang_cepat (same merge as clock-out)", () => {
    expect(correctedStatus({ jamMasukIso: at("09:00"), jamPulangIso: at("16:00"), schedule })).toBe("terlambat");
  });
  it("uses only jam masuk when jam pulang is empty", () => {
    expect(correctedStatus({ jamMasukIso: at("08:00"), jamPulangIso: null, schedule })).toBe("tepat_waktu");
  });
  it("never yields di_luar_lokasi", () => {
    expect(correctedStatus({ jamMasukIso: at("08:00"), jamPulangIso: at("17:00"), schedule })).not.toBe("di_luar_lokasi");
  });
});
