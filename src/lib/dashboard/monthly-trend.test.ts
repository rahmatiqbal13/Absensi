import { describe, it, expect, vi } from "vitest";
import { getMonthlyTrend } from "./monthly-trend";

function makeMockDb(result: { data: unknown; error: unknown }) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

describe("getMonthlyTrend", () => {
  it("aggregates hadir and terlambat counts per day", async () => {
    const db = makeMockDb({
      data: [
        { tanggal: "2026-10-01", status: "tepat_waktu" },
        { tanggal: "2026-10-01", status: "tepat_waktu" },
        { tanggal: "2026-10-01", status: "terlambat" },
        { tanggal: "2026-10-02", status: "terlambat" },
      ],
      error: null,
    });

    const result = await getMonthlyTrend(db as any, "2026-10");

    expect(result).toEqual({
      ok: true,
      points: [
        { date: "2026-10-01", hadir: 2, terlambat: 1 },
        { date: "2026-10-02", hadir: 0, terlambat: 1 },
      ],
    });
  });

  it("returns an empty points array for a month with no attendance data", async () => {
    const db = makeMockDb({ data: [], error: null });
    const result = await getMonthlyTrend(db as any, "2026-10");
    expect(result).toEqual({ ok: true, points: [] });
  });

  it("returns a failure result and logs when the query errors", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = makeMockDb({ data: null, error: { message: "permission denied for table attendances" } });

    const result = await getMonthlyTrend(db as any, "2026-10");

    expect(result).toEqual({ ok: false, error: "Gagal memuat tren kehadiran." });
    expect(errSpy).toHaveBeenCalledWith(
      "getMonthlyTrend: attendances query failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
    errSpy.mockRestore();
  });
});
