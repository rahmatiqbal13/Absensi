import { describe, it, expect } from "vitest";
import { getTodayExceptions } from "./today-exceptions";

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
    );
    expect(res.ok).toBe(false);
  });
});
