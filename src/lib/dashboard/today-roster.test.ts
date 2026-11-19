import { describe, it, expect } from "vitest";
import { getTodayRoster } from "./today-roster";
import type { TodayContext } from "./today-context";

function makeDb(opts: {
  employees: { id: string; nama: string; branch_id: string; branches: { nama: string } }[];
  attendances: { employee_id: string; status: string; jam_masuk: string | null }[];
  error?: unknown;
}) {
  return {
    from(table: string) {
      const q = {
        then: (res: (v: unknown) => void) =>
          res({ data: table === "employees" ? opts.employees : opts.attendances, error: opts.error ?? null }),
        eq: () => q,
        in: () => q,
        order: () => q,
      };
      return { select: () => q };
    },
  } as never;
}

function ctx(working: Record<string, boolean>, onLeave: string[] = [], offToday: string[] = []): TodayContext {
  return {
    today: "2026-11-19",
    workingByBranch: new Map(Object.entries(working)),
    onLeave: new Set(onLeave),
    offToday: new Set(offToday),
  };
}

const emp = (id: string, nama: string, branch = "b1", branchNama = "Jakarta") => ({
  id,
  nama,
  branch_id: branch,
  branches: { nama: branchNama },
});

describe("getTodayRoster", () => {
  it("buckets each person and sorts by bucket then clock-in time", async () => {
    const res = await getTodayRoster(
      makeDb({
        employees: [emp("e1", "Andi"), emp("e2", "Budi"), emp("e3", "Citra"), emp("e4", "Dewi"), emp("e5", "Eka")],
        attendances: [
          { employee_id: "e1", status: "terlambat", jam_masuk: "2026-11-19T01:20:00Z" },
          { employee_id: "e2", status: "tepat_waktu", jam_masuk: "2026-11-19T00:55:00Z" },
          { employee_id: "e3", status: "tepat_waktu", jam_masuk: "2026-11-19T00:40:00Z" },
          { employee_id: "e4", status: "alpa", jam_masuk: null },
        ],
      }),
      undefined,
      ctx({ b1: true }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const people = res.branches[0].people;
    expect(people.map((p) => [p.nama, p.bucket])).toEqual([
      ["Citra", "tepat"],
      ["Budi", "tepat"],
      ["Andi", "terlambat"],
      ["Dewi", "alpa"],
      ["Eka", "alpa"],
    ]);
    expect(people.find((p) => p.nama === "Dewi")?.belumAbsen).toBe(false);
    expect(people.find((p) => p.nama === "Eka")?.belumAbsen).toBe(true);
  });

  it("puts leave as cuti and drops non-working branches and own days off", async () => {
    const res = await getTodayRoster(
      makeDb({
        employees: [emp("e1", "Andi"), emp("e2", "Budi"), emp("e3", "Citra", "b2", "Bandung")],
        attendances: [],
      }),
      undefined,
      ctx({ b1: true, b2: false }, ["e1"], ["e2"]),
    );
    expect(res.ok && res.branches).toEqual([
      {
        branchId: "b1",
        nama: "Jakarta",
        people: [{ employeeId: "e1", nama: "Andi", bucket: "cuti", jamMasuk: null, belumAbsen: false }],
      },
    ]);
  });

  it("returns an empty board for an empty team without querying", async () => {
    const res = await getTodayRoster(makeDb({ employees: [], attendances: [] }), undefined, ctx({}), []);
    expect(res).toEqual({ ok: true, branches: [] });
  });

  it("reports a query error", async () => {
    const res = await getTodayRoster(
      makeDb({ employees: [], attendances: [], error: { message: "x" } }),
      undefined,
      ctx({ b1: true }),
    );
    expect(res.ok).toBe(false);
  });
});
