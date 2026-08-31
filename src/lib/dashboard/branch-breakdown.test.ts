import { describe, it, expect } from "vitest";
import { getBranchBreakdown } from "./branch-breakdown";

// db mock: three tables — branches, employees (active, with branch_id),
// attendances today (status + employees.branch_id embed).
function makeDb(opts: {
  branches: { id: string; nama: string }[];
  activeEmployees: { branch_id: string }[];
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

describe("getBranchBreakdown", () => {
  it("computes hadir/terlambat and alpa = headcount - rows per branch", async () => {
    const res = await getBranchBreakdown(
      makeDb({
        branches: [
          { id: "b1", nama: "Pusat" },
          { id: "b2", nama: "Bandung" },
        ],
        activeEmployees: [
          { branch_id: "b1" },
          { branch_id: "b1" },
          { branch_id: "b1" }, // 3 at b1
          { branch_id: "b2" },
          { branch_id: "b2" }, // 2 at b2
        ],
        attendances: [
          { status: "tepat_waktu", employees: { branch_id: "b1" } },
          { status: "terlambat", employees: { branch_id: "b1" } },
          { status: "tepat_waktu", employees: { branch_id: "b2" } },
        ],
      }),
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
    );
    expect(res.ok).toBe(false);
  });
});
