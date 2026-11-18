import { describe, it, expect, vi } from "vitest";
import { notifyPayslipsPublished } from "./notify-payslips";

function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

function makeDb(slips: unknown[], period: unknown = { bulan: 11, tahun: 2026 }) {
  const upsert = vi.fn((rows: unknown[]) => q({ data: rows.map((_, i) => ({ id: `n${i}` })), error: null }));
  const db = {
    from: (t: string) =>
      t === "payroll_periods"
        ? q({ data: period, error: null })
        : t === "notifications"
          ? { upsert }
          : q({ data: slips, error: null }),
  };
  return { db: db as never, upsert };
}

describe("notifyPayslipsPublished", () => {
  it("notifies active employees once per period, linking to Slip Gaji, without amounts", async () => {
    const { db, upsert } = makeDb([
      { employee_id: "e1", employees: { status: "aktif" } },
      { employee_id: "e2", employees: { status: "nonaktif" } },
    ]);
    expect(await notifyPayslipsPublished(db, "p1")).toEqual({ created: 1 });
    const [rows, opts] = upsert.mock.calls[0] as unknown as [{ isi: string; judul: string }[], unknown];
    expect(rows).toEqual([
      {
        employee_id: "e1",
        jenis: "slip_gaji",
        kunci: "p1",
        judul: "Slip gaji November 2026 sudah terbit",
        isi: "Lihat dan unduh PDF-nya di menu Slip Gaji.",
        link: "/slip-gaji/2026-11",
      },
    ]);
    expect(opts).toEqual({ onConflict: "employee_id,jenis,kunci", ignoreDuplicates: true });
    expect(rows[0].judul + rows[0].isi).not.toMatch(/Rp|\d{3}\.\d{3}/);
  });

  it("creates nothing when the period can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, upsert } = makeDb([], null);
    expect(await notifyPayslipsPublished(db, "p1")).toEqual({ created: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });
});
