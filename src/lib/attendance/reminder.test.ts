import { describe, expect, it } from "vitest";
import { dueClockReminders, dueReminders, type ReminderEmployee, type ReminderSchedule } from "./reminder";

// 2026-11-18 is a Wednesday (dow 3).
const TANGGAL = "2026-11-18";
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const EMP: ReminderEmployee = {
  id: "e1",
  nama: "Budi",
  role: "karyawan",
  branch_id: "b1",
  department_id: null,
  tanggal_mulai_kerja: "2025-01-01",
};
const BRANCH_SCHEDULE: ReminderSchedule = {
  branch_id: "b1",
  department_id: null,
  jam_masuk: "08:00:00",
  jam_pulang: "17:00:00",
  toleransi_terlambat_menit: 15,
  hari_kerja: [1, 2, 3, 4, 5],
};

function run(over: Partial<Parameters<typeof dueReminders>[0]> = {}) {
  return dueReminders({
    tanggal: TANGGAL,
    nowMinutes: at("08:30"),
    employees: [EMP],
    schedules: [BRANCH_SCHEDULE],
    holidays: [],
    onLeave: new Set(),
    attended: new Set(),
    reminded: new Set(),
    ...over,
  }).map((d) => d.employee.id);
}

describe("dueReminders", () => {
  it("reminds an employee once the tolerance has passed", () => {
    expect(run()).toEqual(["e1"]);
    expect(run({ nowMinutes: at("08:15") })).toEqual(["e1"]);
  });

  it("waits until jam masuk + toleransi", () => {
    expect(run({ nowMinutes: at("08:14") })).toEqual([]);
  });

  it("stops at the scheduled clock-out time", () => {
    expect(run({ nowMinutes: at("16:59") })).toEqual(["e1"]);
    expect(run({ nowMinutes: at("17:00") })).toEqual([]);
  });

  it("uses the department's own schedule over the branch default", () => {
    const dept: ReminderSchedule = { ...BRANCH_SCHEDULE, department_id: "d1", jam_masuk: "10:00:00", toleransi_terlambat_menit: 0 };
    const emp = { ...EMP, department_id: "d1" };
    expect(run({ employees: [emp], schedules: [BRANCH_SCHEDULE, dept] })).toEqual([]);
    expect(run({ employees: [emp], schedules: [BRANCH_SCHEDULE, dept], nowMinutes: at("10:00") })).toEqual(["e1"]);
  });

  it("skips a non-working day of the schedule", () => {
    expect(run({ schedules: [{ ...BRANCH_SCHEDULE, hari_kerja: [1, 2] }] })).toEqual([]);
  });

  it("skips national and own-branch holidays, not other branches'", () => {
    expect(run({ holidays: [{ branch_id: null }] })).toEqual([]);
    expect(run({ holidays: [{ branch_id: "b1" }] })).toEqual([]);
    expect(run({ holidays: [{ branch_id: "b2" }] })).toEqual(["e1"]);
  });

  it("skips anyone who attended, is on leave, or was already reminded", () => {
    expect(run({ attended: new Set(["e1"]) })).toEqual([]);
    expect(run({ onLeave: new Set(["e1"]) })).toEqual([]);
    expect(run({ reminded: new Set(["e1"]) })).toEqual([]);
  });

  it("skips super admins, employees without a schedule, and those not started yet", () => {
    expect(run({ employees: [{ ...EMP, role: "super_admin" }] })).toEqual([]);
    expect(run({ schedules: [] })).toEqual([]);
    expect(run({ employees: [{ ...EMP, tanggal_mulai_kerja: "2026-11-19" }] })).toEqual([]);
  });

  it("returns the schedule time for the email", () => {
    const [d] = dueReminders({
      tanggal: TANGGAL,
      nowMinutes: at("09:00"),
      employees: [EMP],
      schedules: [BRANCH_SCHEDULE],
      holidays: [],
      onLeave: new Set(),
      attended: new Set(),
      reminded: new Set(),
    });
    expect(d.jamMasuk).toBe("08:00");
  });

  it("follows today's rostered shift, and skips a rostered libur (0059)", () => {
    const siang = new Map([[EMP.id, new Map([[TANGGAL, { jamMasuk: "15:00", jamPulang: "23:00", toleransiMenit: 0 }]])]]);
    expect(run({ rosters: siang, nowMinutes: at("08:30") })).toEqual([]);
    expect(run({ rosters: siang, nowMinutes: at("15:00") })).toEqual(["e1"]);
    const libur = new Map([[EMP.id, new Map([[TANGGAL, null]])]]);
    expect(run({ rosters: libur })).toEqual([]);
  });
});

describe("dueClockReminders", () => {
  function clock(over: Partial<Parameters<typeof dueClockReminders>[0]> = {}) {
    return dueClockReminders({
      tanggal: TANGGAL,
      nowMinutes: at("07:45"),
      employees: [EMP],
      schedules: [BRANCH_SCHEDULE],
      holidays: [],
      onLeave: new Set(),
      attendance: new Map(),
      remindedMasuk: new Set(),
      remindedPulang: new Set(),
      ...over,
    }).map((d) => `${d.employee.id}:${d.kind}:${d.jam}`);
  }

  it("reminds in the 15 minutes before jam masuk, not earlier or at jam masuk", () => {
    expect(clock()).toEqual(["e1:masuk:08:00"]);
    expect(clock({ nowMinutes: at("07:59") })).toEqual(["e1:masuk:08:00"]);
    expect(clock({ nowMinutes: at("07:44") })).toEqual([]);
    expect(clock({ nowMinutes: at("08:00") })).toEqual([]);
  });

  it("skips the masuk reminder once clocked in or already sent", () => {
    expect(clock({ attendance: new Map([["e1", { clockedOut: false }]]) })).toEqual([]);
    expect(clock({ remindedMasuk: new Set(["e1"]) })).toEqual([]);
  });

  it("reminds to clock out from jam pulang for an hour, only if clocked in and not out", () => {
    const inNotOut = new Map([["e1", { clockedOut: false }]]);
    expect(clock({ nowMinutes: at("17:00"), attendance: inNotOut })).toEqual(["e1:pulang:17:00"]);
    expect(clock({ nowMinutes: at("17:59"), attendance: inNotOut })).toEqual(["e1:pulang:17:00"]);
    expect(clock({ nowMinutes: at("16:59"), attendance: inNotOut })).toEqual([]);
    expect(clock({ nowMinutes: at("18:00"), attendance: inNotOut })).toEqual([]);
    expect(clock({ nowMinutes: at("17:00"), attendance: new Map([["e1", { clockedOut: true }]]) })).toEqual([]);
    expect(clock({ nowMinutes: at("17:00") })).toEqual([]);
    expect(clock({ nowMinutes: at("17:00"), attendance: inNotOut, remindedPulang: new Set(["e1"]) })).toEqual([]);
  });

  it("follows the employee's own schedule and skips days off and leave", () => {
    const dept: ReminderSchedule = { ...BRANCH_SCHEDULE, department_id: "d1", jam_masuk: "10:00:00", jam_pulang: "19:00:00" };
    expect(clock({ nowMinutes: at("09:50"), employees: [{ ...EMP, department_id: "d1" }], schedules: [BRANCH_SCHEDULE, dept] })).toEqual(["e1:masuk:10:00"]);
    expect(clock({ tanggal: "2026-11-22" })).toEqual([]); // Sunday
    expect(clock({ holidays: [{ branch_id: null }] })).toEqual([]);
    expect(clock({ onLeave: new Set(["e1"]) })).toEqual([]);
    expect(clock({ employees: [{ ...EMP, role: "super_admin" }] })).toEqual([]);
  });
});

