import { describe, it, expect, vi } from "vitest";
import { pickSchedule, loadSchedules } from "./resolve";

const rows = [
  { id: "b1-default", branch_id: "b1", department_id: null },
  { id: "b1-gudang", branch_id: "b1", department_id: "gudang" },
  { id: "b2-default", branch_id: "b2", department_id: null },
];

describe("pickSchedule", () => {
  it("uses the department's own schedule when it has one", () => {
    expect(pickSchedule(rows, "b1", "gudang")?.id).toBe("b1-gudang");
  });
  it("falls back to the branch default for a department without one", () => {
    expect(pickSchedule(rows, "b1", "kantor")?.id).toBe("b1-default");
  });
  it("uses the branch default when the employee has no department", () => {
    expect(pickSchedule(rows, "b2", null)?.id).toBe("b2-default");
  });
  it("never applies a department schedule from another branch", () => {
    expect(pickSchedule(rows, "b2", "gudang")?.id).toBe("b2-default");
  });
  it("returns null when nothing applies", () => {
    expect(pickSchedule(rows, "b3", "gudang")).toBeNull();
  });
});

function makeDb(responses: { data: unknown; error: unknown }[]) {
  const selects: string[] = [];
  const db = {
    from: () => {
      const q: Record<string, unknown> = {};
      const res = responses[selects.length];
      q.select = vi.fn((cols: string) => {
        selects.push(cols);
        return q;
      });
      q.in = vi.fn(() => q);
      q.then = (f: (v: unknown) => unknown) => Promise.resolve(res).then(f);
      return q;
    },
  };
  return { db: db as never, selects };
}

describe("loadSchedules", () => {
  it("reads department_id alongside the requested columns", async () => {
    const { db, selects } = makeDb([{ data: [{ id: "x", branch_id: "b1", department_id: "d1" }], error: null }]);
    const res = await loadSchedules(db, "id", ["b1"]);
    expect(selects[0]).toBe("id, branch_id, department_id");
    expect(res.data[0].department_id).toBe("d1");
  });

  it("falls back to branch-only rows before migration 0034", async () => {
    const { db, selects } = makeDb([
      { data: null, error: { code: "42703", message: "column work_schedules.department_id does not exist" } },
      { data: [{ id: "x", branch_id: "b1" }], error: null },
    ]);
    const res = await loadSchedules(db, "id", ["b1"]);
    expect(selects[1]).toBe("id, branch_id");
    expect(res.error).toBeNull();
    expect(res.data).toEqual([{ id: "x", branch_id: "b1", department_id: null }]);
  });

  it("surfaces any other error", async () => {
    const { db } = makeDb([{ data: null, error: { code: "500", message: "boom" } }]);
    const res = await loadSchedules(db, "id");
    expect(res.error?.message).toBe("boom");
    expect(res.data).toEqual([]);
  });
});
