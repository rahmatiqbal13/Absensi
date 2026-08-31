import { describe, it, expect, vi } from "vitest";
import { getTodayContext } from "./today-context";

// A `from(table)` router. Each table resolves to its configured payload; the
// builder is chainable (`.eq`/`.or`/`.lte`/`.gte`) and thenable.
function makeDb(opts: {
  schedules?: { branch_id: string; hari_kerja: number[] }[];
  holidays?: { branch_id: string | null }[];
  leaves?: { employee_id: string }[];
  error?: unknown;
}) {
  const payload = (table: string) => {
    if (table === "work_schedules") return { data: opts.schedules ?? [], error: opts.error ?? null };
    if (table === "holidays") return { data: opts.holidays ?? [], error: opts.error ?? null };
    return { data: opts.leaves ?? [], error: opts.error ?? null };
  };
  return {
    from(table: string) {
      const result = payload(table);
      const q: Record<string, unknown> = {
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
      };
      for (const m of ["select", "eq", "or", "lte", "gte"]) q[m] = vi.fn(() => q);
      return q;
    },
  } as never;
}

// Today's DOW in the UTC-midnight convention the module uses.
const TODAY_DOW = new Date(
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00:00Z`,
).getUTCDay();
const OTHER_DOW = (TODAY_DOW + 1) % 7;

describe("getTodayContext", () => {
  it("marks every branch non-working on a national holiday", async () => {
    const res = await getTodayContext(
      makeDb({
        schedules: [
          { branch_id: "b1", hari_kerja: [0, 1, 2, 3, 4, 5, 6] },
          { branch_id: "b2", hari_kerja: [0, 1, 2, 3, 4, 5, 6] },
        ],
        holidays: [{ branch_id: null }],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.workingByBranch.get("b1")).toBe(false);
    expect(res.ctx.workingByBranch.get("b2")).toBe(false);
  });

  it("marks only the affected branch non-working on a branch-specific holiday", async () => {
    const res = await getTodayContext(
      makeDb({
        schedules: [
          { branch_id: "b1", hari_kerja: [0, 1, 2, 3, 4, 5, 6] },
          { branch_id: "b2", hari_kerja: [0, 1, 2, 3, 4, 5, 6] },
        ],
        holidays: [{ branch_id: "b1" }],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.workingByBranch.get("b1")).toBe(false);
    expect(res.ctx.workingByBranch.get("b2")).toBe(true);
  });

  it("marks a branch non-working when today's DOW is not in its hari_kerja", async () => {
    const res = await getTodayContext(
      makeDb({
        schedules: [
          { branch_id: "b1", hari_kerja: [OTHER_DOW] },
          { branch_id: "b2", hari_kerja: [TODAY_DOW] },
        ],
        holidays: [],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.workingByBranch.get("b1")).toBe(false);
    expect(res.ctx.workingByBranch.get("b2")).toBe(true);
  });

  it("marks a branch working on a normal working day with no holiday", async () => {
    const res = await getTodayContext(
      makeDb({ schedules: [{ branch_id: "b1", hari_kerja: [TODAY_DOW] }], holidays: [] }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.workingByBranch.get("b1")).toBe(true);
  });

  it("collects the distinct employee_ids on approved leave today", async () => {
    const res = await getTodayContext(
      makeDb({
        schedules: [{ branch_id: "b1", hari_kerja: [TODAY_DOW] }],
        leaves: [{ employee_id: "e1" }, { employee_id: "e1" }, { employee_id: "e2" }],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([...res.ctx.onLeave].sort()).toEqual(["e1", "e2"]);
  });

  it("returns an error result on a query error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getTodayContext(makeDb({ error: { message: "boom" } }));
    expect(res.ok).toBe(false);
    errSpy.mockRestore();
  });
});
