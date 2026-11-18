import { describe, it, expect, vi } from "vitest";
import { sendAttendanceReminders } from "./send-reminders";

// Wed 2026-11-18 08:30 WIB.
const NOW = new Date("2026-11-18T08:30:00+07:00");
const EMPLOYEES = [
  { id: "e1", nama: "Budi", role: "karyawan", branch_id: "b1", department_id: null, tanggal_mulai_kerja: "2025-01-01" },
  { id: "e2", nama: "Sari", role: "karyawan", branch_id: "b1", department_id: null, tanggal_mulai_kerja: "2025-01-01" },
];
const SCHEDULE = { branch_id: "b1", department_id: null, jam_masuk: "08:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] };

function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "lte", "gte", "in"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

function makeDb(opts: { attended?: string[]; notified?: string[]; employeesError?: unknown; created?: number } = {}) {
  const upsert = vi.fn((rows: unknown[]) =>
    q({ data: rows.slice(0, opts.created ?? rows.length).map((_, i) => ({ id: `n${i}` })), error: null }),
  );
  const db = {
    from: (t: string) => {
      switch (t) {
        case "employees":
          return q(opts.employeesError ? { data: null, error: opts.employeesError } : { data: EMPLOYEES, error: null });
        case "work_schedules":
          return q({ data: [SCHEDULE], error: null });
        case "attendances":
          return q({ data: (opts.attended ?? []).map((employee_id) => ({ employee_id })), error: null });
        case "notifications":
          return { ...q({ data: (opts.notified ?? []).map((employee_id) => ({ employee_id })), error: null }), upsert };
        default:
          return q({ data: [], error: null });
      }
    },
  };
  return { db: db as never, upsert };
}

describe("sendAttendanceReminders", () => {
  it("creates one idempotent in-app reminder per overdue employee", async () => {
    const { db, upsert } = makeDb({ notified: ["e2"] });
    const res = await sendAttendanceReminders(db, NOW);
    expect(res).toEqual({ ok: true, tanggal: "2026-11-18", due: 1, created: 1 });
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          employee_id: "e1",
          jenis: "lupa_absen",
          kunci: "2026-11-18",
          judul: "Anda belum absen masuk hari ini",
          isi: "Jadwal masuk Anda pukul 08:00 WIB. Kalau hari ini izin atau sakit, ajukan cuti.",
          link: "/absen",
        },
      ],
      { onConflict: "employee_id,jenis,kunci", ignoreDuplicates: true },
    );
  });

  it("does nothing when everyone has clocked in", async () => {
    const { db, upsert } = makeDb({ attended: ["e1", "e2"] });
    expect(await sendAttendanceReminders(db, NOW)).toEqual({ ok: true, tanggal: "2026-11-18", due: 0, created: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fails without writing when a lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, upsert } = makeDb({ employeesError: { message: "boom" } });
    expect(await sendAttendanceReminders(db, NOW)).toEqual({ ok: false, error: "query failed" });
    expect(upsert).not.toHaveBeenCalled();
  });
});
