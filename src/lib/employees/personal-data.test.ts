import { describe, it, expect } from "vitest";
import { formatNomorPegawai, validatePersonalData } from "./personal-data";

const TODAY = "2026-11-18";

describe("validatePersonalData", () => {
  it("accepts a full, valid form and trims text", () => {
    expect(
      validatePersonalData(
        { tempat_lahir: " Surabaya ", tanggal_lahir: "1995-04-12", jenis_kelamin: "L", agama: "Islam", alamat_ktp: "Jl. A", alamat_domisili: "", pendidikan_terakhir: "S1" },
        TODAY,
      ),
    ).toEqual({
      ok: true,
      value: { tempat_lahir: "Surabaya", tanggal_lahir: "1995-04-12", jenis_kelamin: "L", agama: "Islam", alamat_ktp: "Jl. A", alamat_domisili: null, pendidikan_terakhir: "S1" },
    });
  });
  it("allows leaving everything empty", () => {
    expect(validatePersonalData({}, TODAY).ok).toBe(true);
  });
  it("rejects a birth date in the future or implausibly old", () => {
    expect(validatePersonalData({ tanggal_lahir: "2027-01-01" }, TODAY).ok).toBe(false);
    expect(validatePersonalData({ tanggal_lahir: "1900-01-01" }, TODAY).ok).toBe(false);
  });
  it("only accepts listed options", () => {
    expect(validatePersonalData({ jenis_kelamin: "X" }, TODAY).ok).toBe(false);
    expect(validatePersonalData({ agama: "Jedi" }, TODAY).ok).toBe(false);
    expect(validatePersonalData({ pendidikan_terakhir: "S4" }, TODAY).ok).toBe(false);
  });
});

describe("formatNomorPegawai", () => {
  it("groups the 17 digits like a NIP", () => {
    expect(formatNomorPegawai("19950412202307001")).toBe("19950412 202307 001");
    expect(formatNomorPegawai(null)).toBeNull();
  });
});
