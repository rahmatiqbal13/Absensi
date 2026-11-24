import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/schedule/roster", () => ({ loadRoster: async () => new Map() }));

import { applyMachineScans } from "./apply-scans";

type Call = { table: string; op: string; payload?: unknown; filters: unknown[][] };

/** Minimal chainable stand-in for the Supabase query builder. */
function fakeDb(data: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const result = () => {
      if (call.op === "upsert") return { data: (call.payload as unknown[]).map((_, i) => ({ id: String(i) })), error: null };
      if (call.op !== "select") return { data: null, error: null };
      return { data: data[table] ?? [], error: null };
    };
    const b: Record<string, unknown> = {};
    for (const f of ["select", "in", "eq", "gte", "lte", "is", "order", "limit"]) {
      b[f] = (...a: unknown[]) => {
        if (f !== "select") call.filters.push([f, ...a]);
        return b;
      };
    }
    for (const op of ["insert", "update", "upsert"]) {
      b[op] = (payload: unknown) => {
        call.op = op;
        call.payload = payload;
        return b;
      };
    }
    b.then = (res: (v: unknown) => void) => res(result());
    return b;
  };
  return { db: { from } as never, calls };
}

const EMP = { id: "e1", nama: "Budi", pin_mesin: "8", branch_id: "b1", department_id: null };
const SCHED = { id: "s1", jam_masuk: "08:00:00", jam_pulang: "16:00:00", toleransi_terlambat_menit: 10, branch_id: "b1", department_id: null };
const scan = (pin: string, local: string) => ({ pin, waktu: new Date(`${local}+07:00`).toISOString(), namaMesin: pin === "8" ? "budi" : "majid" });

describe("applyMachineScans", () => {
  it("dry run: groups by WIB day, reports unmapped PINs, writes nothing", async () => {
    const { db, calls } = fakeDb({ employees: [EMP], work_schedules: [SCHED], payroll_periods: [], attendances: [] });
    const r = await applyMachineScans(
      db,
      [scan("8", "2026-08-03T07:55:00"), scan("8", "2026-08-03T16:02:11"), scan("8", "2026-08-04T08:30:00"), scan("9", "2026-08-03T07:00:00")],
      { sumber: "file", actorId: "hr", dryRun: true },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unmapped).toEqual([{ pin: "9", namaMesin: "majid", jumlahScan: 1 }]);
    expect(r.days.map((d) => [d.tanggal, d.status, d.aksi])).toEqual([
      ["2026-08-03", "tepat_waktu", "baru"],
      ["2026-08-04", "terlambat", "baru"],
    ]);
    expect(calls.some((c) => c.op !== "select")).toBe(false);
  });

  it("import: stores raw scans, inserts days, skips finalized payroll months, audits", async () => {
    const { db, calls } = fakeDb({
      employees: [EMP],
      work_schedules: [SCHED],
      payroll_periods: [{ branch_id: "b1", bulan: 7, tahun: 2026 }],
      attendances: [],
    });
    const r = await applyMachineScans(
      db,
      [scan("8", "2026-07-31T07:55:00"), scan("8", "2026-08-03T07:55:00"), scan("8", "2026-08-03T07:55:00")],
      { sumber: "file", actorId: "hr", dryRun: false },
    );
    expect(r.ok && r.days.map((d) => [d.tanggal, d.aksi, d.alasan])).toEqual([
      ["2026-07-31", "lewati", "Payroll bulan ini sudah final"],
      ["2026-08-03", "baru", undefined],
    ]);
    expect(r.ok && r.ditulis).toBe(1);
    const upsert = calls.find((c) => c.table === "mesin_scans" && c.op === "upsert");
    expect((upsert?.payload as unknown[]).length).toBe(2); // the duplicate scan was dropped
    const insert = calls.find((c) => c.table === "attendances" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ employee_id: "e1", tanggal: "2026-08-03", metode_masuk: "mesin", status: "tepat_waktu" });
    expect(calls.find((c) => c.table === "audit_logs")?.payload).toMatchObject({ aksi: "mesin_absensi_import", actor_id: "hr" });
  });
});
