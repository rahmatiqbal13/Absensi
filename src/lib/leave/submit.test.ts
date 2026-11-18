import { describe, it, expect, vi } from "vitest";
import { submitLeaveRequest } from "./submit";

const BASE_EMPLOYEE = {
  id: "employee-1",
  role: "karyawan",
  atasan_id: "atasan-1",
  designated_approver_id: "super-admin-1",
  tanggal_mulai_kerja: "2024-01-15",
  status_kontrak: "PKWT",
};

function makeMockDb(opts: {
  balanceRow?: { saldo_awal: number; saldo_terpakai: number } | null;
  balanceError?: { message: string } | null;
  insertError?: { message: string } | null;
  employee?: Partial<typeof BASE_EMPLOYEE>;
} = {}) {
  const { balanceRow = { saldo_awal: 12, saldo_terpakai: 0 }, balanceError = null, insertError = null } = opts;
  const employee = { ...BASE_EMPLOYEE, ...opts.employee };

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
        eq: () => ({ single: () => Promise.resolve({ data: employee, error: null }) }),
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
    const db = makeMockDb({ balanceRow: { saldo_awal: 12, saldo_terpakai: 10 } });
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
    const db = makeMockDb({ balanceRow: { saldo_awal: 12, saldo_terpakai: 12 } });
    const result = await submitLeaveRequest(db as any, { ...BASE_INPUT, jenis: "izin_lain", tanggalSelesai: "2026-10-01" });
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });

    // Distinguish "query skipped" from "query issued but result ignored":
    // leave_balances must never even be selected from.
    expect(db.from).not.toHaveBeenCalledWith("leave_balances");
    expect(db.__balanceSelectMock).not.toHaveBeenCalled();
  });

  it("treats a missing balance row as the full default allowance, like the approval RPC", async () => {
    const db = makeMockDb({ balanceRow: null });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });
  });

  it("refuses annual leave for an intern, even with a 12-day balance row", async () => {
    const db = makeMockDb({ employee: { status_kontrak: "Magang" } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Anak magang tidak mendapat jatah cuti tahunan. Gunakan izin khusus atau cuti sakit.",
    });
    expect(db.__insertMock).not.toHaveBeenCalled();
  });

  it("still lets an intern take sick leave", async () => {
    const db = makeMockDb({ employee: { status_kontrak: "Magang" } });
    const result = await submitLeaveRequest(db as any, {
      ...BASE_INPUT,
      jenis: "sakit",
      tanggalSelesai: "2026-10-01",
    });
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });
  });

  it("refuses annual leave before 12 months of service", async () => {
    const db = makeMockDb({ employee: { tanggal_mulai_kerja: "2026-01-15" } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Cuti tahunan berlaku setelah 12 bulan bekerja, yaitu mulai 15 Januari 2027.",
    });
    expect(db.__insertMock).not.toHaveBeenCalled();
  });

  it("requires a doctor's note for sick leave longer than one day", async () => {
    const db = makeMockDb();
    const sick = { ...BASE_INPUT, jenis: "sakit" };
    expect(await submitLeaveRequest(db as any, sick)).toEqual({
      ok: false,
      error: "Cuti sakit lebih dari 1 hari wajib melampirkan surat dokter.",
    });
    expect(await submitLeaveRequest(db as any, { ...sick, tanggalSelesai: sick.tanggalMulai })).toEqual({
      ok: true,
      requestId: "leave-request-1",
    });
    expect(
      await submitLeaveRequest(db as any, { ...sick, lampiranUrl: "employee-1/surat.pdf" }),
    ).toEqual({ ok: true, requestId: "leave-request-1" });
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
