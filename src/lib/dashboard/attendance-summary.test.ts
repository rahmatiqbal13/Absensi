import { describe, it, expect, vi } from "vitest";
import { getTodaySummary } from "./attendance-summary";
import type { TodayContext } from "./today-context";

// A TodayContext with the given branch working and nobody on leave — passing
// this explicitly keeps the pre-context `alpa` numbers unchanged.
function ctxWorking(branchId = "branch-1", onLeave: string[] = []): TodayContext {
  return {
    today: "2026-08-31",
    workingByBranch: new Map([[branchId, true]]),
    onLeave: new Set(onLeave),
  };
}

// A minimal chainable/thenable query-builder stand-in for Supabase's
// PostgrestFilterBuilder. `.eq()` can be called any number of times (the
// branch-scoped path in attendance-summary.ts chains two calls, the
// unscoped path chains one) and the chain resolves via `.then()` whenever
// it is awaited, regardless of how many `.eq()` calls preceded it.
function makeChain(result: Record<string, unknown>) {
  const chain: PromiseLike<typeof result> & {
    eq: (...args: unknown[]) => typeof chain;
    lte: (...args: unknown[]) => typeof chain;
    gte: (...args: unknown[]) => typeof chain;
  } = {
    eq: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

function makeMockDb(
  opts: {
    attendanceRows?: { status: string }[];
    employeeCount?: number;
    // employee_id values for the approved `leave_requests` rows spanning today.
    // Duplicates are intentional — the impl collapses them into distinct `cuti`.
    leaveEmployeeIds?: string[];
    attendanceError?: unknown;
    employeeError?: unknown;
    leaveError?: unknown;
  } = {},
) {
  const {
    attendanceRows = [],
    employeeCount = 10,
    leaveEmployeeIds = [],
    attendanceError = null,
    employeeError = null,
    leaveError = null,
  } = opts;

  const tables: Record<string, any> = {
    attendances: {
      select: vi.fn(() =>
        makeChain({ data: attendanceError ? null : attendanceRows, error: attendanceError }),
      ),
    },
    employees: {
      select: vi.fn(() =>
        makeChain({ count: employeeError ? null : employeeCount, error: employeeError }),
      ),
    },
    leave_requests: {
      select: vi.fn(() =>
        makeChain({
          data: leaveError ? null : leaveEmployeeIds.map((employee_id) => ({ employee_id })),
          error: leaveError,
        }),
      ),
    },
  };

  return { from: vi.fn((table: string) => tables[table]), _tables: tables };
}

describe("getTodaySummary", () => {
  it("counts hadir, terlambat, and alpa correctly", async () => {
    const db = makeMockDb({
      attendanceRows: [
        { status: "tepat_waktu" },
        { status: "tepat_waktu" },
        { status: "terlambat" },
        { status: "pulang_cepat" },
        { status: "di_luar_lokasi" },
      ],
      employeeCount: 10,
    });

    const result = await getTodaySummary(db as any, undefined, ctxWorking());

    expect(result).toEqual({
      ok: true,
      summary: {
        hadir: 4, // tepat_waktu x2 + pulang_cepat + di_luar_lokasi
        terlambat: 1,
        alpa: 5, // 10 employees - 5 rows with attendance today
        other: 0,
        total: 10,
        pulangCepat: 1, // overlaps hadir
        diLuarLokasi: 1, // overlaps hadir
        cuti: 0, // no approved leave rows
      },
    });
  });

  it("returns all-alpa when nobody has clocked in today", async () => {
    const db = makeMockDb({ attendanceRows: [], employeeCount: 3 });
    const result = await getTodaySummary(db as any, undefined, ctxWorking());
    expect(result).toEqual({
      ok: true,
      summary: {
        hadir: 0,
        terlambat: 0,
        alpa: 3,
        other: 0,
        total: 3,
        pulangCepat: 0,
        diLuarLokasi: 0,
        cuti: 0,
      },
    });
  });

  it("counts explicit alpa rows into alpa and unknown statuses into other, never into alpa", async () => {
    const db = makeMockDb({
      attendanceRows: [
        { status: "tepat_waktu" },
        { status: "alpa" },
        { status: "alpa" },
        { status: "cuti_disetujui" }, // unexpected value
      ],
      employeeCount: 10,
    });

    const result = await getTodaySummary(db as any, undefined, ctxWorking());

    expect(result).toEqual({
      ok: true,
      summary: {
        hadir: 1,
        terlambat: 0,
        // 2 explicit alpa rows + 6 employees with no row at all — the unknown
        // "cuti_disetujui" row must NOT reduce this.
        alpa: 8,
        other: 1,
        total: 10,
        pulangCepat: 0,
        diLuarLokasi: 0,
        cuti: 0,
      },
    });
  });

  it("scopes both counts to the given branch via the employees join, not a nonexistent attendances.branch_id column", async () => {
    const db = makeMockDb({
      attendanceRows: [{ status: "tepat_waktu" }, { status: "terlambat" }],
      employeeCount: 5,
    });

    const result = await getTodaySummary(db as any, "branch-1", ctxWorking("branch-1"));

    expect(result).toEqual({
      ok: true,
      summary: {
        hadir: 1,
        terlambat: 1,
        alpa: 3,
        other: 0,
        total: 5,
        pulangCepat: 0,
        diLuarLokasi: 0,
        cuti: 0,
      },
    });

    // The corrected query must select the embedded `employees` resource and
    // filter on the dotted `employees.branch_id` path — never a bare
    // `branch_id` column on `attendances` (that column does not exist).
    const attendancesSelect = db._tables.attendances.select as ReturnType<typeof vi.fn>;
    expect(attendancesSelect).toHaveBeenCalledWith(
      expect.stringContaining("employees!inner(branch_id)"),
    );
    const attendanceChain = attendancesSelect.mock.results[0].value;
    expect(attendanceChain.eq).toHaveBeenCalledWith("employees.branch_id", "branch-1");
  });

  it("returns a failure result (not zeros) and logs when the attendances query errors", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeMockDb({ attendanceError: { message: "permission denied for table attendances" } });

    const result = await getTodaySummary(db as any, undefined, ctxWorking());

    expect(result).toEqual({ ok: false, error: "Gagal memuat data absensi." });
    expect(errSpy).toHaveBeenCalledWith(
      "getTodaySummary: attendances query failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
    errSpy.mockRestore();
  });

  it("returns a failure result (not zeros) and logs when the employees count query errors", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeMockDb({ employeeError: { message: "permission denied for table employees" } });

    const result = await getTodaySummary(db as any, undefined, ctxWorking());

    expect(result).toEqual({ ok: false, error: "Gagal memuat data absensi." });
    expect(errSpy).toHaveBeenCalledWith(
      "getTodaySummary: employees count query failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
    errSpy.mockRestore();
  });

  it("counts pulang_cepat and di_luar_lokasi as their own fields (overlapping hadir)", async () => {
    const db = makeMockDb({
      attendanceRows: [
        { status: "tepat_waktu" },
        { status: "tepat_waktu" },
        { status: "pulang_cepat" },
        { status: "di_luar_lokasi" },
        { status: "terlambat" },
      ],
      employeeCount: 6,
      leaveEmployeeIds: ["emp-1", "emp-2"],
    });

    const result = await getTodaySummary(db as any, undefined, ctxWorking());

    expect(result).toEqual({
      ok: true,
      summary: {
        hadir: 4, // tepat_waktu x2 + pulang_cepat + di_luar_lokasi
        terlambat: 1,
        alpa: 1, // 6 employees - 5 rows
        other: 0,
        total: 6,
        pulangCepat: 1, // still counted here even though it also counts in hadir
        diLuarLokasi: 1,
        cuti: 2,
      },
    });
  });

  it("counts cuti as the distinct approved-leave employees spanning today", async () => {
    const db = makeMockDb({
      attendanceRows: [{ status: "tepat_waktu" }],
      employeeCount: 5,
      // emp-1 appears twice (e.g. two overlapping approved requests) — collapses to 1
      leaveEmployeeIds: ["emp-1", "emp-1", "emp-2"],
    });

    const result = await getTodaySummary(db as any, undefined, ctxWorking());

    expect(result).toEqual({
      ok: true,
      summary: {
        hadir: 1,
        terlambat: 0,
        alpa: 4,
        other: 0,
        total: 5,
        pulangCepat: 0,
        diLuarLokasi: 0,
        cuti: 2,
      },
    });
  });

  it("returns a failure result (not zeros) and logs when the leave_requests query errors", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeMockDb({
      attendanceRows: [{ status: "tepat_waktu" }],
      employeeCount: 5,
      leaveError: { message: "permission denied for table leave_requests" },
    });

    const result = await getTodaySummary(db as any, undefined, ctxWorking());

    expect(result).toEqual({ ok: false, error: "Gagal memuat data absensi." });
    expect(errSpy).toHaveBeenCalledWith(
      "getTodaySummary: leave_requests query failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
    errSpy.mockRestore();
  });

  it("excludes employees on approved leave today from alpa", async () => {
    const db = makeMockDb({ attendanceRows: [], employeeCount: 5, leaveEmployeeIds: ["e1", "e2"] });

    const result = await getTodaySummary(
      db as any,
      undefined,
      ctxWorking("branch-1", ["e1", "e2"]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 5 no-record employees − 2 on leave.
    expect(result.summary.alpa).toBe(3);
    expect(result.summary.cuti).toBe(2);
  });

  it("reports alpa: 0 when the given branch is not a working day today", async () => {
    const db = makeMockDb({ attendanceRows: [], employeeCount: 5 });
    const ctx: TodayContext = {
      today: "2026-08-31",
      workingByBranch: new Map([["branch-1", false]]),
      onLeave: new Set(),
    };

    const result = await getTodaySummary(db as any, "branch-1", ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.alpa).toBe(0);
  });
});
