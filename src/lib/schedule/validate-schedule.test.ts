import { describe, it, expect } from "vitest";
import { validateScheduleInput } from "./validate-schedule";

const base = { jamMasuk: "09:00", jamPulang: "17:00", hariKerja: ["1", "2", "3", "4", "5"], toleransiMenit: "15" };

describe("validateScheduleInput", () => {
  it("accepts a valid schedule and coerces types", () => {
    expect(validateScheduleInput(base)).toEqual({
      ok: true,
      value: { jamMasuk: "09:00", jamPulang: "17:00", hariKerja: [1, 2, 3, 4, 5], toleransiMenit: 15 },
    });
  });

  it("accepts a single hariKerja value (FormData sends one string, not an array)", () => {
    const result = validateScheduleInput({ ...base, hariKerja: "1" });
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ hariKerja: [1] }) });
  });

  it("dedupes repeated hariKerja values", () => {
    const result = validateScheduleInput({ ...base, hariKerja: ["1", "1", "2"] });
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ hariKerja: [1, 2] }) });
  });

  it("rejects a bad time format", () => {
    expect(validateScheduleInput({ ...base, jamMasuk: "9am" })).toEqual({ ok: false, error: "Jam masuk dan jam pulang harus format HH:MM." });
  });

  it("rejects an out-of-range time that matches the digit shape", () => {
    expect(validateScheduleInput({ ...base, jamMasuk: "25:00" })).toEqual({ ok: false, error: "Jam masuk dan jam pulang harus format HH:MM." });
  });

  it("rejects jam_pulang not after jam_masuk", () => {
    expect(validateScheduleInput({ ...base, jamMasuk: "17:00", jamPulang: "09:00" })).toEqual({ ok: false, error: "Jam pulang harus setelah jam masuk." });
  });

  it("rejects an empty hariKerja", () => {
    expect(validateScheduleInput({ ...base, hariKerja: [] })).toEqual({ ok: false, error: "Pilih minimal satu hari kerja." });
  });

  it("rejects a hariKerja value outside 0-6", () => {
    expect(validateScheduleInput({ ...base, hariKerja: ["7"] })).toEqual({ ok: false, error: "Hari kerja tidak valid." });
  });

  it("rejects a negative or non-numeric toleransi", () => {
    expect(validateScheduleInput({ ...base, toleransiMenit: "-1" })).toEqual({ ok: false, error: "Toleransi keterlambatan harus angka >= 0." });
    expect(validateScheduleInput({ ...base, toleransiMenit: "abc" })).toEqual({ ok: false, error: "Toleransi keterlambatan harus angka >= 0." });
  });
});
