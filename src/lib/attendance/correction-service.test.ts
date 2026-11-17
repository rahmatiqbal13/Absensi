import { describe, it, expect, vi, beforeEach } from "vitest";

const loadEmployeeSchedule = vi.fn();
vi.mock("@/lib/schedule/resolve", () => ({
  loadEmployeeSchedule: (...a: unknown[]) => loadEmployeeSchedule(...a),
}));

import { cancelCorrection, decideCorrection, hrCorrectAttendance, submitCorrection } from "./correction-service";
import { jakartaInstant } from "./correction";

const VALUE = {
  tanggal: "2026-11-17",
  jamMasukIso: jakartaInstant("2026-11-17", "08:30"),
  jamPulangIso: jakartaInstant("2026-11-17", "17:00"),
  alasan: "Lupa absen",
};
const CORR = {
  id: "c1",
  employee_id: "emp",
  approver_id: "boss",
  jam_masuk: VALUE.jamMasukIso,
  jam_pulang: VALUE.jamPulangIso,
  status: "pending",
};
const SCHEDULE = { jam_masuk: "08:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 10 };

/** Minimal chainable fake of the service client, routed per table. */
function makeService(opts: {
  correction?: unknown;
  employee?: unknown;
  insertResult?: { data: unknown; error: unknown };
  updateRows?: unknown[];
  rpcError?: { message: string } | null;
}) {
  const rpc = vi.fn(async () => ({ data: null, error: opts.rpcError ?? null }));
  const insert = vi.fn(() => ({
    select: () => ({ single: async () => opts.insertResult ?? { data: { id: "new", approver_id: "boss" }, error: null } }),
  }));
  const del = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const updateChain = { eq: () => updateChain, select: async () => ({ data: opts.updateRows ?? [], error: null }) };
  const update = vi.fn(() => updateChain);
  const from = vi.fn((table: string) => {
    if (table === "employees") {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: opts.employee ?? null, error: null }) }) }) };
    }
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.correction ?? null, error: null }) }) }),
      insert,
      update,
      delete: del,
    };
  });
  return { db: { from, rpc } as any, rpc, insert, del, update };
}

beforeEach(() => {
  loadEmployeeSchedule.mockReset();
  loadEmployeeSchedule.mockResolvedValue({ data: SCHEDULE, error: null });
});

describe("submitCorrection", () => {
  it("routes to the atasan and stores WIB instants", async () => {
    const { db, insert } = makeService({
      employee: { id: "emp", role: "karyawan", atasan_id: "boss", designated_approver_id: null },
    });
    const r = await submitCorrection(db, "emp", VALUE);
    expect(r).toEqual({ ok: true, correctionId: "new", approverId: "boss" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ employee_id: "emp", approver_id: "boss", jam_masuk: VALUE.jamMasukIso }),
    );
  });

  it("maps the one-pending-per-day unique violation", async () => {
    const { db } = makeService({
      employee: { id: "emp", role: "karyawan", atasan_id: "boss", designated_approver_id: null },
      insertResult: { data: null, error: { code: "23505" } },
    });
    const r = await submitCorrection(db, "emp", VALUE);
    expect(!r.ok && r.error).toMatch(/Sudah ada pengajuan koreksi/);
  });
});

describe("cancelCorrection", () => {
  it("reports when nothing pending matched", async () => {
    const { db } = makeService({ updateRows: [] });
    expect((await cancelCorrection(db, "emp", "c1")).ok).toBe(false);
  });
  it("succeeds when the pending row was updated", async () => {
    const { db } = makeService({ updateRows: [{ id: "c1" }] });
    expect(await cancelCorrection(db, "emp", "c1")).toEqual({ ok: true });
  });
});

describe("decideCorrection", () => {
  it("lets the assigned approver approve, passing the recomputed status", async () => {
    const { db, rpc } = makeService({ correction: CORR, employee: { branch_id: "b", department_id: null } });
    const r = await decideCorrection(db, { id: "boss", role: "atasan" }, "c1", true, " ok ");
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("apply_attendance_correction", {
      p_correction_id: "c1",
      p_decider_id: "boss",
      p_approve: true,
      p_status: "terlambat", // 08:30 vs 08:00 + 10 min
      p_catatan: "ok",
    });
  });

  it("lets HR decide a request routed to someone else", async () => {
    const { db, rpc } = makeService({ correction: CORR, employee: { branch_id: "b", department_id: null } });
    expect((await decideCorrection(db, { id: "hr", role: "hr_admin" }, "c1", true, null)).ok).toBe(true);
    expect(rpc).toHaveBeenCalled();
  });

  it("refuses an atasan who is not the assigned approver", async () => {
    const { db, rpc } = makeService({ correction: CORR });
    const r = await decideCorrection(db, { id: "other", role: "atasan" }, "c1", true, null);
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses deciding one's own correction, even as HR", async () => {
    const { db, rpc } = makeService({ correction: { ...CORR, employee_id: "hr" } });
    const r = await decideCorrection(db, { id: "hr", role: "super_admin" }, "c1", true, null);
    expect(!r.ok && r.error).toMatch(/sendiri/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not compute a status when rejecting", async () => {
    const { db, rpc } = makeService({ correction: CORR });
    await decideCorrection(db, { id: "boss", role: "atasan" }, "c1", false, "Tidak sesuai CCTV");
    expect(loadEmployeeSchedule).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("apply_attendance_correction", expect.objectContaining({ p_approve: false, p_status: null }));
  });

  it("explains a missing schedule instead of guessing a status", async () => {
    loadEmployeeSchedule.mockResolvedValue({ data: null, error: null });
    const { db, rpc } = makeService({ correction: CORR, employee: { branch_id: "b", department_id: null } });
    const r = await decideCorrection(db, { id: "boss", role: "atasan" }, "c1", true, null);
    expect(!r.ok && r.error).toMatch(/Jadwal kerja/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the finalized-payroll RPC error", async () => {
    const { db } = makeService({
      correction: CORR,
      employee: { branch_id: "b", department_id: null },
      rpcError: { message: "payroll period is finalized" },
    });
    const r = await decideCorrection(db, { id: "boss", role: "atasan" }, "c1", true, null);
    expect(!r.ok && r.error).toMatch(/Payroll bulan tersebut sudah difinalisasi/);
  });
});

describe("hrCorrectAttendance", () => {
  it("refuses non-HR and self-correction without writing", async () => {
    const { db, insert } = makeService({});
    expect((await hrCorrectAttendance(db, { id: "x", role: "atasan" }, "emp", VALUE)).ok).toBe(false);
    expect((await hrCorrectAttendance(db, { id: "hr", role: "hr_admin" }, "hr", VALUE)).ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a direct correction and approves it", async () => {
    const { db, insert, rpc } = makeService({
      correction: { ...CORR, id: "new", approver_id: "hr" },
      employee: { branch_id: "b", department_id: null },
    });
    const r = await hrCorrectAttendance(db, { id: "hr", role: "hr_admin" }, "emp", VALUE);
    expect(r).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ approver_id: "hr", langsung: true }));
    expect(rpc).toHaveBeenCalledWith("apply_attendance_correction", expect.objectContaining({ p_correction_id: "new" }));
  });

  it("removes its own pending row when applying fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, del } = makeService({
      correction: { ...CORR, id: "new", approver_id: "hr" },
      employee: { branch_id: "b", department_id: null },
      rpcError: { message: "payroll period is finalized" },
    });
    const r = await hrCorrectAttendance(db, { id: "hr", role: "hr_admin" }, "emp", VALUE);
    expect(r.ok).toBe(false);
    expect(del).toHaveBeenCalled();
  });
});
