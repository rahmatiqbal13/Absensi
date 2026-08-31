import { describe, it, expect } from "vitest";
import { getTodayExceptions } from "./today-exceptions";
import type { TodayContext } from "./today-context";

function makeDb(opts: {
  activeEmployees: { id: string; nama: string; branch_id: string }[];
  attendances: { employee_id: string; status: string }[];
  error?: unknown;
}) {
  return {
    from(table: string) {
      const q = {
        then: (res: (v: unknown) => void) =>
          res(
            table === "employees"
              ? { data: opts.activeEmployees, error: opts.error ?? null }
              : { data: opts.attendances, error: opts.error ?? null },
          ),
        eq() {
          return q;
        },
        in() {
          return q;
        },
        order() {
          return q;
        },
        select() {
          return q;
        },
      };
      return { select: () => q };
    },
  } as never;
}

// A TodayContext with the given branches marked working and no one on leave.
function ctxWith(branches: string[], onLeave: string[] = []): TodayContext {
  return {
    today: "2026-08-31",
    workingByBranch: new Map(branches.map((b) => [b, true])),
    onLeave: new Set(onLeave),
  };
}

describe("getTodayExceptions", () => {
  it("includes late/dll/pc rows and employees with no row as alpa, sorted alpa→terlambat→dll→pc", async () => {
    const res = await getTodayExceptions(
      makeDb({
        activeEmployees: [
          { id: "e1", nama: "Andi", branch_id: "b1" },
          { id: "e2", nama: "Siti", branch_id: "b1" },
          { id: "e3", nama: "Budi", branch_id: "b1" },
          { id: "e4", nama: "Rina", branch_id: "b1" },
        ],
        attendances: [
          { employee_id: "e2", status: "terlambat" },
          { employee_id: "e3", status: "di_luar_lokasi" },
          { employee_id: "e4", status: "tepat_waktu" }, // not an exception
        ],
      }),
      undefined,
      ctxWith(["b1"]),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => [r.nama, r.status])).toEqual([
      ["Andi", "alpa"], // no row
      ["Siti", "terlambat"],
      ["Budi", "di_luar_lokasi"],
    ]);
  });

  it("treats an explicit 'alpa' attendance row the same as a no-row employee", async () => {
    const res = await getTodayExceptions(
      makeDb({
        activeEmployees: [
          { id: "e1", nama: "Andi", branch_id: "b1" },
          { id: "e2", nama: "Siti", branch_id: "b1" },
        ],
        attendances: [
          { employee_id: "e1", status: "alpa" }, // explicit alpa row
          { employee_id: "e2", status: "terlambat" },
        ],
      }),
      undefined,
      ctxWith(["b1"]),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => [r.nama, r.status])).toEqual([
      ["Andi", "alpa"], // explicit-alpa row, sorts first
      ["Siti", "terlambat"],
    ]);
  });

  it("returns an error result on a query error", async () => {
    const res = await getTodayExceptions(
      makeDb({ activeEmployees: [], attendances: [], error: { message: "x" } }),
      undefined,
      ctxWith(["b1"]),
    );
    expect(res.ok).toBe(false);
  });

  it("skips an employee who is on approved leave today (not an exception)", async () => {
    const res = await getTodayExceptions(
      makeDb({
        activeEmployees: [
          { id: "e1", nama: "Andi", branch_id: "b1" },
          { id: "e2", nama: "Siti", branch_id: "b1" },
        ],
        attendances: [],
      }),
      undefined,
      ctxWith(["b1"], ["e1"]),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => r.nama)).toEqual(["Siti"]);
  });

  it("returns nonWorkingDay when the given branch is not working today", async () => {
    const ctx: TodayContext = {
      today: "2026-08-31",
      workingByBranch: new Map([["b1", false]]),
      onLeave: new Set(),
    };
    const res = await getTodayExceptions(
      makeDb({
        activeEmployees: [{ id: "e1", nama: "Andi", branch_id: "b1" }],
        attendances: [],
      }),
      "b1",
      ctx,
    );
    expect(res).toEqual({ ok: true, nonWorkingDay: true, rows: [] });
  });

  it("skips an employee whose branch is non-working when no branch filter is given", async () => {
    const ctx: TodayContext = {
      today: "2026-08-31",
      workingByBranch: new Map([
        ["b1", true],
        ["b2", false],
      ]),
      onLeave: new Set(),
    };
    const res = await getTodayExceptions(
      makeDb({
        activeEmployees: [
          { id: "e1", nama: "Andi", branch_id: "b1" },
          { id: "e2", nama: "Siti", branch_id: "b2" },
        ],
        attendances: [],
      }),
      undefined,
      ctx,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => r.nama)).toEqual(["Andi"]);
  });
});
