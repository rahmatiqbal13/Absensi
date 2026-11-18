import type { SupabaseClient } from "@supabase/supabase-js";
import { logOptionalLookup } from "@/lib/supabase/missing-column";

/**
 * Shift roster (migration 0059). For a given employee and date the roster
 * either names a shift (its times replace the regular schedule's that day,
 * and the day is a working day even if the regular schedule says otherwise),
 * says "libur" (not a working day), or is silent (regular schedule applies).
 */
export type DayShift = { nama?: string; jamMasuk: string; jamPulang: string; toleransiMenit: number };
/** null = libur. */
export type RosterDay = DayShift | null;
/** date "YYYY-MM-DD" → that day's roster entry, for one employee. */
export type Roster = Map<string, RosterDay>;

export type BaseSchedule = { jamMasuk: string; jamPulang: string; toleransiMenit: number; hariKerja: number[] };

export type DayPlan = {
  working: boolean;
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  source: "shift" | "libur" | "jadwal";
  shiftNama?: string;
};

/**
 * The schedule that applies to one date. A rostered shift wins over the
 * regular working days and over holidays (someone rostered on a holiday is
 * working); a rostered libur is a day off; otherwise the regular schedule.
 */
export function dayPlan(base: BaseSchedule, tanggal: string, isHoliday: boolean, roster?: Roster): DayPlan {
  if (roster?.has(tanggal)) {
    const r = roster.get(tanggal)!;
    if (r === null) return { working: false, jamMasuk: base.jamMasuk, jamPulang: base.jamPulang, toleransiMenit: base.toleransiMenit, source: "libur" };
    return { working: true, jamMasuk: r.jamMasuk, jamPulang: r.jamPulang, toleransiMenit: r.toleransiMenit, source: "shift", shiftNama: r.nama };
  }
  const dow = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
  return {
    working: base.hariKerja.includes(dow) && !isHoliday,
    jamMasuk: base.jamMasuk,
    jamPulang: base.jamPulang,
    toleransiMenit: base.toleransiMenit,
    source: "jadwal",
  };
}

/**
 * Roster rows for these employees between `from` and `to`, per employee.
 * Pre-0059 (no tables) or a failed read = empty: everyone on the regular schedule.
 */
export async function loadRoster(
  db: SupabaseClient,
  employeeIds: readonly string[],
  from: string,
  to: string,
): Promise<Map<string, Roster>> {
  const out = new Map<string, Roster>();
  if (employeeIds.length === 0) return out;
  const { data, error } = await db
    .from("shift_assignments")
    .select("employee_id, tanggal, shifts(nama, jam_masuk, jam_pulang, toleransi_terlambat_menit)")
    .in("employee_id", [...employeeIds])
    .gte("tanggal", from)
    .lte("tanggal", to);
  if (error) {
    logOptionalLookup("loadRoster", error, "0059");
    return out;
  }
  type Row = {
    employee_id: string;
    tanggal: string;
    shifts: { nama: string; jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number } | null;
  };
  for (const r of (data ?? []) as unknown as Row[]) {
    const roster = out.get(r.employee_id) ?? new Map<string, RosterDay>();
    roster.set(
      r.tanggal,
      r.shifts
        ? {
            nama: r.shifts.nama,
            jamMasuk: r.shifts.jam_masuk.slice(0, 5),
            jamPulang: r.shifts.jam_pulang.slice(0, 5),
            toleransiMenit: Number(r.shifts.toleransi_terlambat_menit),
          }
        : null,
    );
    out.set(r.employee_id, roster);
  }
  return out;
}

/**
 * A work_schedules-shaped row with one date's rostered shift applied: same
 * columns, so clock-in/out and corrections keep their existing logic. Any
 * failure (no table yet, network) keeps the regular schedule — a clock-in is
 * never blocked by the roster.
 */
export async function withRosterShift<T extends { jam_masuk?: string; jam_pulang: string; toleransi_terlambat_menit?: number }>(
  db: SupabaseClient,
  employeeId: string,
  tanggal: string,
  schedule: T,
): Promise<T> {
  try {
    const day = (await loadRoster(db, [employeeId], tanggal, tanggal)).get(employeeId)?.get(tanggal);
    if (!day) return schedule; // no entry, or libur (the regular times are the fair yardstick then)
    return { ...schedule, jam_masuk: `${day.jamMasuk}:00`, jam_pulang: `${day.jamPulang}:00`, toleransi_terlambat_menit: day.toleransiMenit };
  } catch (e) {
    console.warn("withRosterShift: roster lookup failed, using regular schedule", e);
    return schedule;
  }
}
