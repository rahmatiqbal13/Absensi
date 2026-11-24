"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { routePatterns } from "@/lib/routing/paths";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { notifyPayslipsPublished } from "@/lib/payroll/notify-payslips";
import {
  computePayrollForBranch,
  type PayrollEmployee,
  type ApprovedLeave,
} from "@/lib/payroll/compute";
import type { AttendanceRowLite } from "@/lib/payroll/deduction";
import { loadScheduleAssignments, loadSchedules, pickSchedule } from "@/lib/schedule/resolve";
import { shouldDeductAlpa } from "@/lib/payroll/absence-deduction";
import { loadPph21Config } from "@/lib/payroll/pph21-config";
import { logOptionalLookup } from "@/lib/supabase/missing-column";
import { loadApprovedOvertime } from "@/lib/requests/approved-overtime";
import { loadRoster } from "@/lib/schedule/roster";
import { getCurrentEmployee } from "@/lib/auth/session";
import { reprocessStoredScans } from "@/lib/mesin/reprocess";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const RPC_ERROR_MESSAGES: Record<string, string> = {
  "only hr admin may run payroll": "Hanya HR admin yang dapat menjalankan payroll.",
  "payroll period is not finalized": "Finalisasi periode ini dulu sebelum menandainya dibayar.",
  "payment date is in the future": "Tanggal pembayaran tidak boleh di masa depan.",
  "payroll period not found": "Periode payroll tidak ditemukan.",
  "payroll period is finalized": "Periode ini sudah difinalisasi dan terkunci.",
  "payroll period is already finalized": "Periode ini sudah difinalisasi sebelumnya.",
  "cannot finalize a payroll period with no payslips":
    "Tidak dapat memfinalisasi periode tanpa slip gaji.",
  "payroll period is still draft": "Periode ini belum difinalisasi.",
  "payroll period is already paid":
    "Periode ini sudah ditandai dibayar. Batalkan status dibayar dulu bila memang perlu dibuka kembali.",
};

function mapRpcError(message: string | undefined): string {
  if (!message) return "Gagal memproses payroll.";
  for (const [key, friendly] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(key)) return friendly;
  }
  console.error("payroll: unmapped RPC error", message);
  return "Gagal memproses payroll.";
}

// Last day of a month as "YYYY-MM-DD" (date-only math, UTC-safe).
function monthBounds(tahun: number, bulan: number): { start: string; end: string } {
  const mm = String(bulan).padStart(2, "0");
  const lastDay = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  return { start: `${tahun}-${mm}-01`, end: `${tahun}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export async function createPayrollPeriod(
  branchId: string,
  bulan: number,
  tahun: number,
): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { error } = await db
    .from("payroll_periods")
    .insert({ branch_id: branchId, bulan, tahun });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Periode payroll untuk cabang dan bulan ini sudah ada." };
    }
    console.error("createPayrollPeriod: insert failed", error);
    return { ok: false, error: "Gagal membuat periode payroll." };
  }
  revalidatePath("/payroll");
  return { ok: true };
}

/**
 * Builds the period's payslips. `employeeIds` limits it to the chosen people
 * (still only active employees of the period's branch — anything else is
 * ignored); omitted = everyone. Regenerating replaces ALL slips of the period,
 * so the selection is the period's final list.
 */
export async function generatePayroll(periodId: string, employeeIds?: string[]): Promise<ActionResult> {
  if (employeeIds && employeeIds.length === 0) {
    return { ok: false, error: "Pilih minimal satu karyawan." };
  }
  const db = await createServerSupabaseClient();

  const { data: period, error: periodErr } = await db
    .from("payroll_periods")
    .select("id, branch_id, bulan, tahun, status")
    .eq("id", periodId)
    .single();
  if (periodErr || !period) {
    console.error("generatePayroll: period lookup failed", periodErr);
    return { ok: false, error: "Periode payroll tidak ditemukan." };
  }

  const { start, end } = monthBounds(period.tahun, period.bulan);

  const [employeesRes, scheduleRes, holidaysRes] = await Promise.all([
    (() => {
      const q = db
        .from("employees")
        .select("id, gaji_pokok, tanggal_mulai_kerja, department_id")
        .eq("branch_id", period.branch_id)
        .eq("status", "aktif")
        // Interns (status magang) never get a payslip, whatever ids are sent.
        .not("status_kontrak", "ilike", "%magang%");
      return employeeIds ? q.in("id", employeeIds) : q;
    })(),
    // Branch default + any department schedules; each employee picks theirs.
    loadSchedules<{
      id: string;
      jam_masuk: string;
      jam_pulang: string;
      toleransi_terlambat_menit: number;
      hari_kerja: number[];
    }>(db, "id, jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja", [period.branch_id]),
    db
      .from("holidays")
      .select("tanggal")
      // national (branch_id null) OR this branch only — design doc §5
      .or(`branch_id.is.null,branch_id.eq.${period.branch_id}`)
      .gte("tanggal", start)
      .lte("tanggal", end),
  ]);

  if (employeesRes.error || scheduleRes.error || holidaysRes.error) {
    console.error("generatePayroll: reference data lookup failed", {
      employees: employeesRes.error,
      schedule: scheduleRes.error,
      holidays: holidaysRes.error,
    });
    return { ok: false, error: "Gagal memuat data untuk payroll." };
  }
  if (scheduleRes.data.length === 0) {
    return { ok: false, error: "Cabang ini belum punya jadwal kerja." };
  }

  // Separate, migration-tolerant lookup: pre-0032 the column doesn't exist, and
  // the fail-safe for a fine is "not charged", never "charged".
  const { data: fineRows, error: fineErr } = await db
    .from("work_schedules")
    .select("id, potong_terlambat")
    .eq("branch_id", period.branch_id);
  if (fineErr) console.error("generatePayroll: potong_terlambat lookup failed", fineErr);
  const fineBySchedule = new Map(
    (fineErr ? [] : (fineRows ?? [])).map((f) => [f.id as string, f.potong_terlambat === true]),
  );

  // Alpa deduction (0035): separate, migration-tolerant reads. Fail-safe is
  // "not deducted" — the current policy is full salary.
  const [companyAlpaRes, employeeAlpaRes] = await Promise.all([
    db.from("app_settings").select("potong_alpa").eq("id", 1).maybeSingle(),
    db.from("employees").select("id, potong_alpa").eq("branch_id", period.branch_id),
  ]);
  if (companyAlpaRes.error) console.error("generatePayroll: app_settings.potong_alpa lookup failed", companyAlpaRes.error);
  if (employeeAlpaRes.error) console.error("generatePayroll: employees.potong_alpa lookup failed", employeeAlpaRes.error);
  const companyPotongAlpa = !companyAlpaRes.error && companyAlpaRes.data?.potong_alpa === true;
  const alpaOverride = new Map<string, boolean | null>(
    employeeAlpaRes.error
      ? []
      : ((employeeAlpaRes.data ?? []) as { id: string; potong_alpa: boolean | null }[]).map((e) => [e.id, e.potong_alpa]),
  );
  // Overrides are unreadable => nobody is deducted (never fall through to the company default).
  const potongAlpaFor = (id: string) =>
    !employeeAlpaRes.error && shouldDeductAlpa(companyPotongAlpa, alpaOverride.get(id));

  // PPh 21 method + tables (0036/0039). No silent fallback.
  const taxRes = await loadPph21Config(db);
  if (!taxRes.ok) return { ok: false, error: taxRes.error };

  // TER needs each employee's PTKP status (0039).
  const { data: ptkpRows, error: ptkpErr } = await db
    .from("employees")
    .select("id, status_ptkp")
    .eq("branch_id", period.branch_id);
  if (ptkpErr && taxRes.config.metode === "ter") {
    console.error("generatePayroll: status_ptkp lookup failed", ptkpErr);
    return { ok: false, error: "Gagal memuat status PTKP karyawan." };
  }
  const ptkpById = new Map(((ptkpRows ?? []) as { id: string; status_ptkp: string }[]).map((r) => [r.id, r.status_ptkp]));

  // Overtime toggle per schedule (0039). Tolerant: unreadable => no overtime paid.
  const { data: otRows, error: otErr } = await db
    .from("work_schedules")
    .select("id, hitung_lembur")
    .eq("branch_id", period.branch_id);
  if (otErr) logOptionalLookup("generatePayroll: hitung_lembur", otErr, "0039");
  const lemburBySchedule = new Map(
    (otErr ? [] : (otRows ?? [])).map((r) => [r.id as string, r.hitung_lembur === true]),
  );

  if (employeeIds && (employeesRes.data ?? []).length === 0) {
    return { ok: false, error: "Karyawan yang dipilih tidak aktif di cabang ini." };
  }

  const employees = (employeesRes.data ?? []) as {
    id: string;
    gaji_pokok: number;
    tanggal_mulai_kerja: string | null;
    department_id: string | null;
  }[];

  // Group employees by the schedule that applies to them (jadwal khusus 0065 first).
  const assigned = await loadScheduleAssignments(db, employees.map((e) => e.id));
  const groups = new Map<string, { schedule: (typeof scheduleRes.data)[number]; employees: typeof employees }>();
  for (const e of employees) {
    const schedule = pickSchedule(scheduleRes.data, period.branch_id, e.department_id, assigned.get(e.id));
    if (!schedule) {
      return {
        ok: false,
        error: "Sebagian karyawan belum punya jadwal kerja. Atur jadwal cabang atau departemennya dulu.",
      };
    }
    const g = groups.get(schedule.id) ?? { schedule, employees: [] };
    g.employees.push(e);
    groups.set(schedule.id, g);
  }

  const activeIds = employees.map((e) => e.id);

  const [attendanceRes, leaveRes, approvedOvertime, rosterByEmployee] = await Promise.all([
    activeIds.length
      ? db
          .from("attendances")
          .select("employee_id, tanggal, status, jam_masuk, jam_pulang")
          .in("employee_id", activeIds)
          .gte("tanggal", start)
          .lte("tanggal", end)
      : Promise.resolve({ data: [], error: null }),
    activeIds.length
      ? db
          .from("leave_requests")
          .select("employee_id, tanggal_mulai, tanggal_selesai, jenis")
          .eq("status", "approved")
          .in("employee_id", activeIds)
          .lte("tanggal_mulai", end)
          .gte("tanggal_selesai", start)
      : Promise.resolve({ data: [], error: null }),
    // Only approved lembur is paid (0058).
    loadApprovedOvertime(db, activeIds, start, end),
    // Shift roster (0059): per-day times and working days.
    loadRoster(db, activeIds, start, end),
  ]);

  if (attendanceRes.error || leaveRes.error) {
    console.error("generatePayroll: attendance/leave lookup failed", {
      attendance: attendanceRes.error,
      leave: leaveRes.error,
    });
    return { ok: false, error: "Gagal memuat data untuk payroll." };
  }

  const attendancesByEmployee = new Map<string, Map<string, AttendanceRowLite>>();
  for (const row of (attendanceRes.data ?? []) as {
    employee_id: string;
    tanggal: string;
    status: string;
    jam_masuk: string | null;
    jam_pulang: string | null;
  }[]) {
    const byDate = attendancesByEmployee.get(row.employee_id) ?? new Map();
    byDate.set(row.tanggal, {
      status: row.status,
      jam_masuk: row.jam_masuk,
      jam_pulang: row.jam_pulang,
    });
    attendancesByEmployee.set(row.employee_id, byDate);
  }

  const approvedLeavesByEmployee = new Map<string, ApprovedLeave[]>();
  for (const row of (leaveRes.data ?? []) as {
    employee_id: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    jenis: string;
  }[]) {
    const list = approvedLeavesByEmployee.get(row.employee_id) ?? [];
    list.push({ tanggalMulai: row.tanggal_mulai, tanggalSelesai: row.tanggal_selesai, jenis: row.jenis });
    approvedLeavesByEmployee.set(row.employee_id, list);
  }

  const holidayDates = ((holidaysRes.data ?? []) as { tanggal: string }[]).map((h) => h.tanggal);
  const rows = [...groups.values()].flatMap(({ schedule, employees: members }) =>
    computePayrollForBranch({
      year: period.tahun,
      month: period.bulan,
      employees: members.map<PayrollEmployee>((e) => ({
        id: e.id,
        gajiPokok: Number(e.gaji_pokok),
        tanggalMulaiKerja: e.tanggal_mulai_kerja,
        potongAlpa: potongAlpaFor(e.id),
        statusPtkp: ptkpById.get(e.id) ?? null,
      })),
      schedule: {
        jamMasuk: schedule.jam_masuk,
        jamPulang: schedule.jam_pulang,
        toleransiMenit: Number(schedule.toleransi_terlambat_menit),
        hariKerja: schedule.hari_kerja,
        potongTerlambat: fineBySchedule.get(schedule.id) ?? false,
        hitungLembur: lemburBySchedule.get(schedule.id) ?? false,
      },
      holidayDates,
      attendancesByEmployee,
      approvedLeavesByEmployee,
      pph21: taxRes.config,
      approvedOvertime,
      rosterByEmployee,
    }),
  );

  const { data: count, error: rpcErr } = await db.rpc("generate_payroll", {
    p_period_id: periodId,
    p_rows: rows,
  });
  if (rpcErr) {
    return { ok: false, error: mapRpcError(rpcErr.message) };
  }

  revalidatePath(routePatterns.payrollPeriod, "page");
  return { ok: true, message: `${Number(count) || rows.length} slip gaji dibuat.` };
}

export async function finalizePayroll(periodId: string): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { error } = await db.rpc("finalize_payroll", { p_period_id: periodId });
  if (error) {
    return { ok: false, error: mapRpcError(error.message) };
  }
  revalidatePath(routePatterns.payrollPeriod, "page");
  revalidatePath("/payroll");
  // The RPC refuses a second finalize, so this fires once per period. After
  // the response, so HR isn't kept waiting on the mail provider.
  after(() => notifyPayslipsPublished(createServiceRoleSupabaseClient(), periodId));
  return { ok: true };
}

/**
 * Records (tanggal = "YYYY-MM-DD") or clears (tanggal = null) the payment of a
 * finalized period. The RPC re-checks HR + final and writes the audit entry.
 */
export async function setPayrollPaid(periodId: string, tanggal: string | null): Promise<ActionResult> {
  if (tanggal !== null && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return { ok: false, error: "Tanggal pembayaran tidak valid." };
  }
  const db = await createServerSupabaseClient();
  const { error } = await db.rpc("set_payroll_paid", { p_period_id: periodId, p_tanggal: tanggal });
  if (error) return { ok: false, error: mapRpcError(error.message) };
  revalidatePath(routePatterns.payrollPeriod, "page");
  revalidatePath("/payroll");
  revalidatePath("/slip-gaji");
  return { ok: true, message: tanggal ? "Periode ditandai sudah dibayar." : "Status dibayar dibatalkan." };
}

/**
 * Returns a finalized (not yet paid) period to draft, then puts the machine
 * scans stored for that month — skipped while it was final — into attendance.
 * HR then regenerates and finalizes the payslips again.
 */
export async function reopenPayroll(periodId: string): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { data: period } = await db.from("payroll_periods").select("branch_id, bulan, tahun").eq("id", periodId).maybeSingle();
  const { error } = await db.rpc("reopen_payroll", { p_period_id: periodId });
  if (error) {
    if (error.message?.includes("reopen_payroll")) {
      return { ok: false, error: "Fitur ini butuh migrasi 0064_reopen_payroll.sql." };
    }
    return { ok: false, error: mapRpcError(error.message) };
  }

  let message = "Periode dibuka kembali. Generate ulang slip lalu finalisasi lagi.";
  if (period) {
    const me = await getCurrentEmployee(db);
    const r = await reprocessStoredScans(createServiceRoleSupabaseClient(), {
      branchId: period.branch_id as string,
      tahun: period.tahun as number,
      bulan: period.bulan as number,
      actorId: me?.id ?? null,
    });
    if (!r.ok) {
      console.error("reopenPayroll: reprocessing stored scans failed", r.error);
      message = "Periode dibuka kembali, tetapi scan mesin tersimpan gagal diproses. Coba tarik ulang dari mesin.";
    } else if (r.ditulis) {
      message = `Periode dibuka kembali; ${r.ditulis} hari absensi diisi dari ${r.scan} scan mesin tersimpan. Generate ulang slip lalu finalisasi lagi.`;
    }
  }
  revalidatePath(routePatterns.payrollPeriod, "page");
  revalidatePath("/payroll");
  revalidatePath("/slip-gaji");
  revalidatePath("/laporan");
  return { ok: true, message };
}
