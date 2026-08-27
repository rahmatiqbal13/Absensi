import { describe, it, expect, vi } from "vitest";
import { getMonthlyTrend } from "./monthly-trend";

function makeMockDb(rows: { tanggal: string; status: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

describe("getMonthlyTrend", () => {
  it("aggregates hadir and terlambat counts per day", async () => {
    const db = makeMockDb([
      { tanggal: "2026-10-01", status: "tepat_waktu" },
      { tanggal: "2026-10-01", status: "tepat_waktu" },
      { tanggal: "2026-10-01", status: "terlambat" },
      { tanggal: "2026-10-02", status: "terlambat" },
    ]);

    const trend = await getMonthlyTrend(db as any, "2026-10");

    expect(trend).toEqual([
      { date: "2026-10-01", hadir: 2, terlambat: 1 },
      { date: "2026-10-02", hadir: 0, terlambat: 1 },
    ]);
  });

  it("returns an empty array for a month with no attendance data", async () => {
    const db = makeMockDb([]);
    const trend = await getMonthlyTrend(db as any, "2026-10");
    expect(trend).toEqual([]);
  });
});
