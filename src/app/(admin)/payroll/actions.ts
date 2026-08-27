"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  computePayrollForBranch,
  type PayrollEmployee,
  type ApprovedLeave,
} from "@/lib/payroll/compute";
import type { AttendanceRowLite } from "@/lib/payroll/deduction";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const RPC_ERROR_MESSAGES: Record<string, string> = {
  "only hr admin may run payroll": "Hanya HR admin yang dapat menjalankan payroll.",
  "payroll period not found": "Periode payroll tidak ditemukan.",
  "payroll period is finalized": "Periode ini sudah difinalisasi dan terkunci.",
  "payroll period is already finalized": "Periode ini sudah difinalisasi sebelumnya.",
  "cannot finalize a payroll period with no payslips":
    "Tidak dapat memfinalisasi periode tanpa slip gaji.",
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

export async function generatePayroll(periodId: string): Promise<ActionResult> {
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
    db
      .from("employees")
      .select("id, gaji_pokok, tanggal_mulai_kerja")
      .eq("branch_id", period.branch_id)
      .eq("status", "aktif"),
    db
      .from("work_schedules")
      .select("jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja")
      .eq("branch_id", period.branch_id)
      .limit(1)
      .maybeSingle(),
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
  if (!scheduleRes.data) {
    return { ok: false, error: "Cabang ini belum punya jadwal kerja." };
  }

  const employees = (employeesRes.data ?? []) as {
    id: string;
    gaji_pokok: number;
    tanggal_mulai_kerja: string | null;
  }[];
  const employeeIds = employees.map((e) => e.id);

  const [attendanceRes, leaveRes] = await Promise.all([
    employeeIds.length
      ? db
          .from("attendances")
          .select("employee_id, tanggal, status, jam_masuk, jam_pulang")
          .in("employee_id", employeeIds)
          .gte("tanggal", start)
          .lte("tanggal", end)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? db
          .from("leave_requests")
          .select("employee_id, tanggal_mulai, tanggal_selesai, jenis")
          .eq("status", "approved")
          .in("employee_id", employeeIds)
          .lte("tanggal_mulai", end)
          .gte("tanggal_selesai", start)
      : Promise.resolve({ data: [], error: null }),
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

  const rows = computePayrollForBranch({
    year: period.tahun,
    month: period.bulan,
    employees: employees.map<PayrollEmployee>((e) => ({
      id: e.id,
      gajiPokok: Number(e.gaji_pokok),
      tanggalMulaiKerja: e.tanggal_mulai_kerja,
    })),
    schedule: {
      jamMasuk: scheduleRes.data.jam_masuk,
      jamPulang: scheduleRes.data.jam_pulang,
      toleransiMenit: Number(scheduleRes.data.toleransi_terlambat_menit),
      hariKerja: scheduleRes.data.hari_kerja,
    },
    holidayDates: ((holidaysRes.data ?? []) as { tanggal: string }[]).map((h) => h.tanggal),
    attendancesByEmployee,
    approvedLeavesByEmployee,
  });

  const { data: count, error: rpcErr } = await db.rpc("generate_payroll", {
    p_period_id: periodId,
    p_rows: rows,
  });
  if (rpcErr) {
    return { ok: false, error: mapRpcError(rpcErr.message) };
  }

  revalidatePath(`/payroll/${periodId}`);
  return { ok: true, message: `${Number(count) || rows.length} slip gaji dibuat.` };
}

export async function finalizePayroll(periodId: string): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { error } = await db.rpc("finalize_payroll", { p_period_id: periodId });
  if (error) {
    return { ok: false, error: mapRpcError(error.message) };
  }
  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/payroll");
  return { ok: true };
}
