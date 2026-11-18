import { describe, it, expect } from "vitest";
import { canDecide, validateWorkRequest } from "./work-requests";

const TODAY = "2026-11-18";

describe("validateWorkRequest", () => {
  it("accepts a same-day lembur window", () => {
    expect(validateWorkRequest({ jenis: "lembur", tanggal: TODAY, jam_mulai: "17:00", jam_selesai: "20:00", alasan: "Laporan akhir bulan" }, TODAY)).toEqual({
      ok: true,
      value: { jenis: "lembur", tanggal_mulai: TODAY, tanggal_selesai: TODAY, jam_mulai: "17:00", jam_selesai: "20:00", tujuan: null, alasan: "Laporan akhir bulan" },
    });
  });
  it("rejects lembur that ends before it starts or crosses midnight", () => {
    expect(validateWorkRequest({ jenis: "lembur", tanggal: TODAY, jam_mulai: "20:00", jam_selesai: "02:00", alasan: "x" }, TODAY).ok).toBe(false);
  });
  it("limits how far back and ahead", () => {
    expect(validateWorkRequest({ jenis: "lembur", tanggal: "2026-10-01", jam_mulai: "17:00", jam_selesai: "18:00", alasan: "x" }, TODAY).ok).toBe(false);
    expect(validateWorkRequest({ jenis: "dinas_luar", tanggal_mulai: "2027-03-01", tujuan: "X", alasan: "x" }, TODAY).ok).toBe(false);
  });
  it("needs a destination and a valid range for dinas luar", () => {
    expect(validateWorkRequest({ jenis: "dinas_luar", tanggal_mulai: TODAY, tanggal_selesai: TODAY, tujuan: "", alasan: "x" }, TODAY).ok).toBe(false);
    expect(validateWorkRequest({ jenis: "dinas_luar", tanggal_mulai: "2026-11-20", tanggal_selesai: "2026-11-19", tujuan: "X", alasan: "x" }, TODAY).ok).toBe(false);
    expect(validateWorkRequest({ jenis: "dinas_luar", tanggal_mulai: "2026-11-20", tanggal_selesai: "", tujuan: "Lidah", alasan: "Rapat" }, TODAY)).toMatchObject({
      ok: true,
      value: { tanggal_mulai: "2026-11-20", tanggal_selesai: "2026-11-20", tujuan: "Lidah" },
    });
  });
  it("needs a reason", () => {
    expect(validateWorkRequest({ jenis: "lembur", tanggal: TODAY, jam_mulai: "17:00", jam_selesai: "18:00", alasan: " " }, TODAY).ok).toBe(false);
  });
});

describe("canDecide", () => {
  const req = { employee_id: "e1", approver_id: "a1", status: "pending" };
  it("lets the assigned approver and HR decide", () => {
    expect(canDecide({ id: "a1", role: "atasan" }, req)).toBe(true);
    expect(canDecide({ id: "hr", role: "hr_admin" }, req)).toBe(true);
  });
  it("never the requester, another atasan, or a decided request", () => {
    expect(canDecide({ id: "e1", role: "hr_admin" }, req)).toBe(false);
    expect(canDecide({ id: "a2", role: "atasan" }, req)).toBe(false);
    expect(canDecide({ id: "hr", role: "hr_admin" }, { ...req, status: "approved" })).toBe(false);
  });
});
