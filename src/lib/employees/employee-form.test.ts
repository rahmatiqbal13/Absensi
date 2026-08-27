import { describe, it, expect } from "vitest";
import { validateEmployeeInput } from "./employee-form";

const base = {
  nama: "Budi Santoso",
  email: "budi@contoh.co.id",
  jabatan: "Staff",
  statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-02-01",
  gajiPokok: "8000000",
  role: "karyawan",
  branchId: "11111111-1111-1111-1111-111111111111",
  departmentId: "",
  atasanId: "",
  designatedApproverId: "",
};

describe("validateEmployeeInput", () => {
  it("accepts a valid karyawan payload and coerces types", () => {
    const result = validateEmployeeInput(base);
    expect(result).toEqual({
      ok: true,
      value: {
        nama: "Budi Santoso",
        email: "budi@contoh.co.id",
        jabatan: "Staff",
        statusKontrak: "tetap",
        tanggalMulaiKerja: "2026-02-01",
        gajiPokok: 8_000_000,
        role: "karyawan",
        branchId: "11111111-1111-1111-1111-111111111111",
        departmentId: null,
        atasanId: null,
        designatedApproverId: null,
      },
    });
  });

  it("rejects a missing required field", () => {
    const result = validateEmployeeInput({ ...base, nama: "" });
    expect(result).toEqual({ ok: false, error: "Nama, email, jabatan, tanggal mulai kerja, dan cabang wajib diisi." });
  });

  it("rejects an invalid email", () => {
    const result = validateEmployeeInput({ ...base, email: "budi-at-contoh" });
    expect(result).toEqual({ ok: false, error: "Format email tidak valid." });
  });

  it("rejects an unknown role", () => {
    const result = validateEmployeeInput({ ...base, role: "boss" });
    expect(result).toEqual({ ok: false, error: "Role tidak valid." });
  });

  it("rejects a negative or non-numeric gaji pokok", () => {
    expect(validateEmployeeInput({ ...base, gajiPokok: "-1" })).toEqual({ ok: false, error: "Gaji pokok harus angka >= 0." });
    expect(validateEmployeeInput({ ...base, gajiPokok: "abc" })).toEqual({ ok: false, error: "Gaji pokok harus angka >= 0." });
  });

  it("requires designatedApproverId for hr_admin and super_admin", () => {
    const result = validateEmployeeInput({ ...base, role: "hr_admin", designatedApproverId: "" });
    expect(result).toEqual({ ok: false, error: "Approver pengganti wajib untuk role HR Admin / Super Admin." });
  });

  it("accepts hr_admin when a designatedApproverId is present", () => {
    const result = validateEmployeeInput({
      ...base, role: "hr_admin", designatedApproverId: "22222222-2222-2222-2222-222222222222",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-ISO tanggalMulaiKerja", () => {
    const result = validateEmployeeInput({ ...base, tanggalMulaiKerja: "01/02/2026" });
    expect(result).toEqual({ ok: false, error: "Tanggal mulai kerja harus format YYYY-MM-DD." });
  });
});
