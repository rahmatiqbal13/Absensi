import { describe, it, expect } from "vitest";
import { getBranchBreakdown } from "./branch-breakdown";
import type { TodayContext } from "./today-context";

// db mock: three tables — branches, employees (active, with id + branch_id),
// attendances today (status + employees.branch_id embed).
function makeDb(opts: {
  branches: { id: string; nama: string }[];
  activeEmployees: { id: string; branch_id: string }[];
  attendances: { status: string; employees: { branch_id: string } }[];
  error?: unknown;
}) {
  return {
    from(table: string) {
      const resolve = (r: unknown) => ({
        then: (res: (v: unknown) => void) => res(r),
        eq() {
          return this;
        },
        order() {
          return this;
        },
      });
      if (table === "branches")
        return { select: () => resolve({ data: opts.branches, error: opts.error ?? null }) };
      if (table === "employees")
        return { select: () => resolve({ data: opts.activeEmployees, error: opts.error ?? null }) };
      return { select: () => resolve({ data: opts.attendances, error: opts.error ?? null }) };
    },
  } as never;
}

function ctxWith(branches: string[], onLeave: string[] = []): TodayContext {
  return {
    today: "2026-08-31",
    workingByBranch: new Map(branches.map((b) => [b, true])),
    onLeave: new Set(onLeave),
  };
}

describe("getBranchBreakdown", () => {
  it("computes hadir/terlambat and alpa = headcount - rows per branch", async () => {
    const res = await getBranchBreakdown(
      makeDb({
        branches: [
          { id: "b1", nama: "Pusat" },
          { id: "b2", nama: "Bandung" },
        ],
        activeEmployees: [
          { id: "e1", branch_id: "b1" },
          { id: "e2", branch_id: "b1" },
          { id: "e3", branch_id: "b1" }, // 3 at b1
          { id: "e4", branch_id: "b2" },
          { id: "e5", branch_id: "b2" }, // 2 at b2
        ],
        attendances: [
          { status: "tepat_waktu", employees: { branch_id: "b1" } },
          { status: "terlambat", employees: { branch_id: "b1" } },
          { status: "tepat_waktu", employees: { branch_id: "b2" } },
        ],
      }),
      ctxWith(["b1", "b2"]),
    );
    expect(res).toEqual({
      ok: true,
      rows: [
        { branchId: "b1", nama: "Pusat", hadir: 1, terlambat: 1, alpa: 1 }, // 3 - 2 rows
        { branchId: "b2", nama: "Bandung", hadir: 1, terlambat: 0, alpa: 1 }, // 2 - 1 row
      ],
    });
  });

  it("returns an error result when a query fails", async () => {
    const res = await getBranchBreakdown(
      makeDb({ branches: [], activeEmployees: [], attendances: [], error: { message: "x" } }),
      ctxWith([]),
    );
    expect(res.ok).toBe(false);
  });

  it("reports alpa: 0 for a branch marked non-working in ctx", async () => {
    const ctx: TodayContext = {
      today: "2026-08-31",
      workingByBranch: new Map([
        ["b1", true],
        ["b2", false],
      ]),
      onLeave: new Set(),
    };
    const res = await getBranchBreakdown(
      makeDb({
        branches: [
          { id: "b1", nama: "Pusat" },
          { id: "b2", nama: "Bandung" },
        ],
        activeEmployees: [
          { id: "e1", branch_id: "b1" },
          { id: "e2", branch_id: "b2" },
          { id: "e3", branch_id: "b2" },
        ],
        attendances: [],
      }),
      ctx,
    );
    expect(res).toEqual({
      ok: true,
      rows: [
        { branchId: "b1", nama: "Pusat", hadir: 0, terlambat: 0, alpa: 1 },
        { branchId: "b2", nama: "Bandung", hadir: 0, terlambat: 0, alpa: 0 }, // non-working
      ],
    });
  });

  it("excludes an employee on approved leave from that branch's alpa", async () => {
    const res = await getBranchBreakdown(
      makeDb({
        branches: [{ id: "b1", nama: "Pusat" }],
        activeEmployees: [
          { id: "e1", branch_id: "b1" },
          { id: "e2", branch_id: "b1" },
          { id: "e3", branch_id: "b1" },
        ],
        attendances: [],
      }),
      ctxWith(["b1"], ["e2"]),
    );
    expect(res).toEqual({
      ok: true,
      rows: [{ branchId: "b1", nama: "Pusat", hadir: 0, terlambat: 0, alpa: 2 }], // 3 - 0 rows - 1 leave
    });
  });
});
