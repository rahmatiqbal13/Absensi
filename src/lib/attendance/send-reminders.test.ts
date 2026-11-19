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

function makeDb(
  opts: {
    /** Saved Pengumuman > Reminder rows (0060). */
    settings?: unknown[];
    attended?: string[];
    /** Clocked in and out. */
    clockedOut?: string[];
    /** Already notified today: employee id, or [id, kunci]. */
    notified?: (string | [string, string])[];
    employeesError?: unknown;
    created?: number;
  } = {},
) {
  const upsert = vi.fn((rows: unknown[]) =>
    q({ data: rows.slice(0, opts.created ?? rows.length).map((_, i) => ({ id: `n${i}` })), error: null }),
  );
  const db = {
    from: (t: string) => {
      switch (t) {
        case "employees":
          return q(opts.employeesError ? { data: null, error: opts.employeesError } : { data: EMPLOYEES, error: null });
        case "reminder_settings":
          return q({ data: opts.settings ?? [], error: null });
        case "work_schedules":
          return q({ data: [SCHEDULE], error: null });
        case "attendances":
          return q({
            data: [
              ...(opts.attended ?? []).map((employee_id) => ({ employee_id, jam_pulang: null })),
              ...(opts.clockedOut ?? []).map((employee_id) => ({ employee_id, jam_pulang: "2026-11-18T10:00:00Z" })),
            ],
            error: null,
          });
        case "notifications":
          return {
            ...q({
              data: (opts.notified ?? []).map((n) =>
                typeof n === "string" ? { employee_id: n, kunci: "2026-11-18" } : { employee_id: n[0], kunci: n[1] },
              ),
              error: null,
            }),
            upsert,
          };
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

  it("reminds before jam masuk, once", async () => {
    const at0745 = new Date("2026-11-18T07:45:00+07:00");
    const { db, upsert } = makeDb({ notified: [["e2", "2026-11-18:masuk"]] });
    expect(await sendAttendanceReminders(db, at0745)).toMatchObject({ ok: true, due: 1 });
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({ employee_id: "e1", kunci: "2026-11-18:masuk", judul: "Sebentar lagi jam masuk" }),
    ]);
  });

  it("reminds at jam pulang only those clocked in but not out", async () => {
    const at1700 = new Date("2026-11-18T17:00:00+07:00");
    const { db, upsert } = makeDb({ attended: ["e1"], clockedOut: ["e2"] });
    expect(await sendAttendanceReminders(db, at1700)).toMatchObject({ ok: true, due: 1 });
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        employee_id: "e1",
        kunci: "2026-11-18:pulang",
        judul: "Sudah jam pulang",
        isi: "Jadwal pulang Anda pukul 17:00 WIB. Jangan lupa absen pulang.",
      }),
    ]);
  });

  it("uses HR's own time and wording, and skips a reminder that is off", async () => {
    const at0730 = new Date("2026-11-18T07:30:00+07:00");
    const settings = [
      { jenis: "masuk", aktif: true, menit: 30, judul: "Halo {nama}", isi: "Masuk pukul {jam}" },
    ];
    const { db, upsert } = makeDb({ settings });
    expect(await sendAttendanceReminders(db, at0730)).toMatchObject({ ok: true, due: 2 });
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({ employee_id: "e1", judul: "Halo Budi", isi: "Masuk pukul 08:00" }),
      expect.objectContaining({ employee_id: "e2", judul: "Halo Sari" }),
    ]);

    const off = makeDb({ settings: [{ ...settings[0], aktif: false }] });
    expect(await sendAttendanceReminders(off.db, at0730)).toMatchObject({ ok: true, due: 0 });
  });
});

