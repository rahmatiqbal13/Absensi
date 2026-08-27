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
  balanceError?: { message: string } | null;
  insertError?: { message: string } | null;
} = {}) {
  const { balanceRow = { saldo_sisa: 12 }, balanceError = null, insertError = null } = opts;

  // Spies for the chain steps whose arguments/payloads the tests assert on.
  const balanceMaybeSingleMock = vi
    .fn()
    .mockResolvedValue({ data: balanceRow, error: balanceError });
  const balanceTahunEqMock = vi.fn().mockReturnValue({ maybeSingle: balanceMaybeSingleMock });
  const balanceEmployeeEqMock = vi.fn().mockReturnValue({ eq: balanceTahunEqMock });
  const balanceSelectMock = vi.fn().mockReturnValue({ eq: balanceEmployeeEqMock });

  const insertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        insertError
          ? { data: null, error: insertError }
          : { data: { id: "leave-request-1" }, error: null },
      ),
    }),
  });

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_EMPLOYEE, error: null }) }),
      }),
    },
    leave_balances: {
      select: balanceSelectMock,
    },
    leave_requests: {
      insert: insertMock,
    },
  };

  return {
    from: vi.fn((table: string) => tables[table]),
    __balanceSelectMock: balanceSelectMock,
    __balanceEmployeeEqMock: balanceEmployeeEqMock,
    __balanceTahunEqMock: balanceTahunEqMock,
    __balanceMaybeSingleMock: balanceMaybeSingleMock,
    __insertMock: insertMock,
  };
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

    // The balance lookup must be scoped to this employee and the request's year.
    expect(db.__balanceEmployeeEqMock).toHaveBeenCalledWith("employee_id", "employee-1");
    expect(db.__balanceTahunEqMock).toHaveBeenCalledWith("tahun", 2026);

    // The persisted payload, not just the returned result.
    expect(db.__insertMock).toHaveBeenCalledWith({
      employee_id: "employee-1",
      jenis: "tahunan",
      tanggal_mulai: "2026-10-01",
      tanggal_selesai: "2026-10-03",
      alasan: "Liburan keluarga",
      lampiran_url: null,
      approver_id: "atasan-1",
      is_self_request: false,
    });
  });

  it("rejects a tahunan request that exceeds the remaining balance", async () => {
    const db = makeMockDb({ balanceRow: { saldo_sisa: 2 } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Saldo cuti tidak mencukupi. Sisa saldo: 2 hari, diajukan: 3 hari.",
    });
    expect(db.__balanceEmployeeEqMock).toHaveBeenCalledWith("employee_id", "employee-1");
    expect(db.__balanceTahunEqMock).toHaveBeenCalledWith("tahun", 2026);
    expect(db.__insertMock).not.toHaveBeenCalled();
  });

  it("skips the balance check entirely for non-tahunan leave types", async () => {
    const db = makeMockDb({ balanceRow: { saldo_sisa: 0 } });
    const result = await submitLeaveRequest(db as any, { ...BASE_INPUT, jenis: "sakit" });
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });

    // Distinguish "query skipped" from "query issued but result ignored":
    // leave_balances must never even be selected from.
    expect(db.from).not.toHaveBeenCalledWith("leave_balances");
    expect(db.__balanceSelectMock).not.toHaveBeenCalled();
  });

  it("treats a missing balance row as zero remaining for tahunan requests", async () => {
    const db = makeMockDb({ balanceRow: null });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Saldo cuti tidak mencukupi. Sisa saldo: 0 hari, diajukan: 3 hari.",
    });
  });

  it("fails closed when the leave_balances query itself errors", async () => {
    const db = makeMockDb({ balanceError: { message: "connection reset" } });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await submitLeaveRequest(db as any, BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "Gagal memeriksa saldo cuti." });
    expect(db.__insertMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("returns an error when the insert fails", async () => {
    const db = makeMockDb({ insertError: { message: "constraint violation" } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({ ok: false, error: "Gagal mengajukan cuti." });
  });
});
