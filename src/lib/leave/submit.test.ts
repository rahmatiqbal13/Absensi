import { describe, it, expect, vi } from "vitest";
import { submitLeaveRequest } from "./submit";

const BASE_EMPLOYEE = {
  id: "employee-1",
  role: "karyawan",
  atasan_id: "atasan-1",
  designated_approver_id: "super-admin-1",
};

function makeMockDb(opts: {
  balanceRow?: { saldo_sisa: number } | null;
  insertError?: { message: string } | null;
} = {}) {
  const { balanceRow = { saldo_sisa: 12 }, insertError = null } = opts;

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_EMPLOYEE, error: null }) }),
      }),
    },
    leave_balances: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: balanceRow, error: null }),
          }),
        }),
      }),
    },
    leave_requests: {
      insert: () => ({
        select: () => ({
          single: () =>
            insertError
              ? Promise.resolve({ data: null, error: insertError })
              : Promise.resolve({ data: { id: "leave-request-1" }, error: null }),
        }),
      }),
    },
  };

  return { from: vi.fn((table: string) => tables[table]) };
}

const BASE_INPUT = {
  employeeId: "employee-1",
  jenis: "tahunan",
  tanggalMulai: "2026-10-01",
  tanggalSelesai: "2026-10-03",
  alasan: "Liburan keluarga",
};

describe("submitLeaveRequest", () => {
  it("submits successfully when balance is sufficient", async () => {
    const db = makeMockDb();
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });
  });

  it("rejects a tahunan request that exceeds the remaining balance", async () => {
    const db = makeMockDb({ balanceRow: { saldo_sisa: 2 } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Saldo cuti tidak mencukupi. Sisa saldo: 2 hari, diajukan: 3 hari.",
    });
  });

  it("skips the balance check entirely for non-tahunan leave types", async () => {
    const db = makeMockDb({ balanceRow: { saldo_sisa: 0 } });
    const result = await submitLeaveRequest(db as any, { ...BASE_INPUT, jenis: "sakit" });
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });
  });

  it("treats a missing balance row as zero remaining for tahunan requests", async () => {
    const db = makeMockDb({ balanceRow: null });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Saldo cuti tidak mencukupi. Sisa saldo: 0 hari, diajukan: 3 hari.",
    });
  });

  it("returns an error when the insert fails", async () => {
    const db = makeMockDb({ insertError: { message: "constraint violation" } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({ ok: false, error: "Gagal mengajukan cuti." });
  });
});
