import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailBatch = vi.fn();
vi.mock("@/lib/email/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/send")>()),
  sendEmailBatch: (...a: unknown[]) => sendEmailBatch(...a),
}));
vi.mock("@/lib/app-url", () => ({ appUrl: () => "https://tapabsen.vercel.app" }));

import { notifyPayslipsPublished } from "./notify-payslips";

function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

function db(slips: unknown[], period: unknown = { bulan: 11, tahun: 2026 }) {
  return {
    from: (t: string) =>
      t === "payroll_periods" ? q({ data: period, error: null }) : q({ data: slips, error: null }),
  } as never;
}

beforeEach(() => {
  sendEmailBatch.mockReset();
  sendEmailBatch.mockImplementation(async (m: unknown[]) => ({ sent: m.length, failed: 0 }));
});

describe("notifyPayslipsPublished", () => {
  it("emails active employees a link to the slip, without amounts", async () => {
    const res = await notifyPayslipsPublished(
      db([
        { employees: { nama: "Budi", email: "budi@contoh.id", status: "aktif" } },
        { employees: { nama: "Sari", email: "sari@contoh.id", status: "nonaktif" } },
      ]),
      "p1",
    );
    expect(res).toEqual({ sent: 1, failed: 0 });
    const [msgs] = sendEmailBatch.mock.calls[0] as [{ to: string; subject: string; text: string }[]];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ to: "budi@contoh.id", subject: "Slip gaji November 2026 sudah terbit" });
    expect(msgs[0].text).toContain("https://tapabsen.vercel.app/slip-gaji/2026-11");
    expect(msgs[0].text).not.toMatch(/Rp|\d{3}\.\d{3}/);
  });

  it("sends nothing when the period can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notifyPayslipsPublished(db([], null), "p1")).toEqual({ sent: 0, failed: 0 });
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });
});
