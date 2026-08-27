import { describe, it, expect, vi } from "vitest";
import { getTodaySummary } from "./attendance-summary";

// A minimal chainable/thenable query-builder stand-in for Supabase's
// PostgrestFilterBuilder. `.eq()` can be called any number of times (the
// branch-scoped path in attendance-summary.ts chains two calls, the
// unscoped path chains one) and the chain resolves via `.then()` whenever
// it is awaited, regardless of how many `.eq()` calls preceded it.
function makeChain(result: { data?: unknown; error: null } | { count: number; error: null }) {
  const chain: PromiseLike<typeof result> & { eq: (...args: unknown[]) => typeof chain } = {
    eq: vi.fn(() => chain),
    then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

function makeMockDb(
  opts: {
    attendanceRows?: { status: string }[];
    employeeCount?: number;
  } = {},
) {
  const { attendanceRows = [], employeeCount = 10 } = opts;

  const tables: Record<string, any> = {
    attendances: {
      select: vi.fn(() => makeChain({ data: attendanceRows, error: null })),
    },
    employees: {
      select: vi.fn(() => makeChain({ count: employeeCount, error: null })),
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

    const summary = await getTodaySummary(db as any);

    expect(summary).toEqual({
      hadir: 4, // tepat_waktu x2 + pulang_cepat + di_luar_lokasi
      terlambat: 1,
      alpa: 5, // 10 employees - 5 rows with attendance today
      total: 10,
    });
  });

  it("returns all-alpa when nobody has clocked in today", async () => {
    const db = makeMockDb({ attendanceRows: [], employeeCount: 3 });
    const summary = await getTodaySummary(db as any);
    expect(summary).toEqual({ hadir: 0, terlambat: 0, alpa: 3, total: 3 });
  });

  it("scopes both counts to the given branch via the employees join, not a nonexistent attendances.branch_id column", async () => {
    const db = makeMockDb({
      attendanceRows: [{ status: "tepat_waktu" }, { status: "terlambat" }],
      employeeCount: 5,
    });

    const summary = await getTodaySummary(db as any, "branch-1");

    expect(summary).toEqual({ hadir: 1, terlambat: 1, alpa: 3, total: 5 });

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
});
