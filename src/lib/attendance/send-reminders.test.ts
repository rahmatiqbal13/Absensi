import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailBatch = vi.fn();
vi.mock("@/lib/email/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/send")>()),
  sendEmailBatch: (...a: unknown[]) => sendEmailBatch(...a),
}));
vi.mock("@/lib/app-url", () => ({ appUrl: () => "https://tapabsen.vercel.app" }));

import { sendAttendanceReminders } from "./send-reminders";

// Wed 2026-11-18 08:30 WIB.
const NOW = new Date("2026-11-18T08:30:00+07:00");
const EMPLOYEES = [
  { id: "e1", nama: "Budi", email: "budi@contoh.id", role: "karyawan", branch_id: "b1", department_id: null, tanggal_mulai_kerja: "2025-01-01" },
  { id: "e2", nama: "Sari", email: "sari@contoh.id", role: "karyawan", branch_id: "b1", department_id: null, tanggal_mulai_kerja: "2025-01-01" },
];
const SCHEDULE = { branch_id: "b1", department_id: null, jam_masuk: "08:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] };

function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "lte", "gte", "in"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

function makeDb(opts: { claimed: string[]; attended?: string[]; employeesError?: unknown }) {
  const upsert = vi.fn(() => q({ data: opts.claimed.map((employee_id) => ({ employee_id })), error: null }));
  const db = {
    from: (t: string) => {
      switch (t) {
        case "employees":
          return q(opts.employeesError ? { data: null, error: opts.employeesError } : { data: EMPLOYEES, error: null });
        case "work_schedules":
          return q({ data: [SCHEDULE], error: null });
        case "attendances":
          return q({ data: (opts.attended ?? []).map((employee_id) => ({ employee_id })), error: null });
        case "attendance_reminders":
          return { ...q({ data: [], error: null }), upsert };
        default:
          return q({ data: [], error: null });
      }
    },
  };
  return { db: db as never, upsert };
}

beforeEach(() => {
  sendEmailBatch.mockReset();
  sendEmailBatch.mockImplementation(async (m: unknown[]) => ({ sent: m.length, failed: 0 }));
});

describe("sendAttendanceReminders", () => {
  it("claims the due employees, then emails only the ones this run claimed", async () => {
    // e2 was claimed by an overlapping run a moment ago.
    const { db, upsert } = makeDb({ claimed: ["e1"] });
    const res = await sendAttendanceReminders(db, NOW);
    expect(res).toEqual({ ok: true, tanggal: "2026-11-18", due: 1, sent: 1, failed: 0 });
    expect(upsert).toHaveBeenCalledWith(
      [{ employee_id: "e1", tanggal: "2026-11-18" }, { employee_id: "e2", tanggal: "2026-11-18" }],
      { onConflict: "employee_id,tanggal", ignoreDuplicates: true },
    );
    const [msgs] = sendEmailBatch.mock.calls[0] as [{ to: string; text: string }[]];
    expect(msgs.map((m) => m.to)).toEqual(["budi@contoh.id"]);
    expect(msgs[0].text).toContain("08:00 WIB");
    expect(msgs[0].text).toContain("https://tapabsen.vercel.app/absen");
  });

  it("does nothing when everyone has clocked in", async () => {
    const { db, upsert } = makeDb({ claimed: [], attended: ["e1", "e2"] });
    expect(await sendAttendanceReminders(db, NOW)).toMatchObject({ ok: true, due: 0 });
    expect(upsert).not.toHaveBeenCalled();
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("fails without emailing when a lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = makeDb({ claimed: [], employeesError: { message: "boom" } });
    expect(await sendAttendanceReminders(db, NOW)).toEqual({ ok: false, error: "query failed" });
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });
});
