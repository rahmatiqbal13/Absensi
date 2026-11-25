import type { SupabaseClient } from "@supabase/supabase-js";
import { countWorkingDays, requiresBalanceCheck } from "./balance";
import { loadScheduleAssignments, loadSchedules, pickSchedule } from "@/lib/schedule/resolve";
import { annualAllowance } from "./balance-lookup";
import { isMagang } from "@/lib/employees/contracts";

/**
 * Everything an approver needs beside the request itself: how many *working*
 * days it covers, what it will actually cost the balance, the balance left,
 * and which teammates are already off in the same window.
 *
 * Since 0069 `approve_leave_request` charges cuti tahunan in working days of
 * the employee's schedule minus holidays — the same count as `workingDays`.
 */

export type ReviewRequestInput = {
  id: string;
  employeeId: string;
  branchId: string | null;
  departmentId: string | null;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
};

export type LeaveClash = {
  requestId: string;
  nama: string;
  status: "pending" | "approved";
  tanggalMulai: string;
  tanggalSelesai: string;
};

export type LeaveReview = {
  workingDays: number;
  /** Days the approval RPC will deduct; null when the type doesn't touch the balance. */
  chargedDays: number | null;
  /** Balance before this request; null when the type doesn't touch the balance. */
  balance: { sisa: number; awal: number; tahun: number } | null;
  clashes: LeaveClash[];
  departmentName: string | null;
  teamSize: number | null;
};

// ---------- pure helpers ----------

export { countWorkingDays } from "./balance";

export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

export type TeamLeave = LeaveClash & { employeeId: string; departmentId: string | null; branchId: string | null };

/** Other people in the same department + branch whose leave overlaps this request. */
export function findClashes(req: ReviewRequestInput, teamLeaves: TeamLeave[]): LeaveClash[] {
  if (!req.departmentId) return [];
  return teamLeaves
    .filter(
      (l) =>
        l.requestId !== req.id &&
        l.employeeId !== req.employeeId &&
        l.departmentId === req.departmentId &&
        l.branchId === req.branchId &&
        rangesOverlap(req.tanggalMulai, req.tanggalSelesai, l.tanggalMulai, l.tanggalSelesai),
    )
    .map(({ requestId, nama, status, tanggalMulai, tanggalSelesai }) => ({
      requestId,
      nama,
      status,
      tanggalMulai,
      tanggalSelesai,
    }))
    .sort((a, b) => a.tanggalMulai.localeCompare(b.tanggalMulai));
}

// ---------- loader ----------

type Result = { ok: true; byRequest: Map<string, LeaveReview> } | { ok: false; error: string };

export async function loadLeaveReviewContext(
  db: SupabaseClient,
  requests: ReviewRequestInput[],
): Promise<Result> {
  const byRequest = new Map<string, LeaveReview>();
  if (requests.length === 0) return { ok: true, byRequest };

  const minFrom = requests.reduce((m, r) => (r.tanggalMulai < m ? r.tanggalMulai : m), requests[0].tanggalMulai);
  const maxTo = requests.reduce((m, r) => (r.tanggalSelesai > m ? r.tanggalSelesai : m), requests[0].tanggalSelesai);
  const branchIds = [...new Set(requests.map((r) => r.branchId).filter((b): b is string => !!b))];
  const deptIds = [...new Set(requests.map((r) => r.departmentId).filter((d): d is string => !!d))];
  const balanceReqs = requests.filter((r) => requiresBalanceCheck(r.jenis));
  const balanceEmployeeIds = [...new Set(balanceReqs.map((r) => r.employeeId))];
  const balanceYears = [...new Set(balanceReqs.map((r) => Number(r.tanggalMulai.slice(0, 4))))];

  const none = Promise.resolve({ data: [] as never[], error: null });

  const [schedRes, holRes, balRes, teamLeaveRes, teamRes, deptRes, kontrakRes] = await Promise.all([
    branchIds.length
      ? loadSchedules<{ hari_kerja: number[] | null }>(db, "hari_kerja", branchIds)
      : none,
    db.from("holidays").select("tanggal, branch_id").gte("tanggal", minFrom).lte("tanggal", maxTo),
    balanceEmployeeIds.length
      ? db
          .from("leave_balances")
          .select("employee_id, tahun, saldo_awal, saldo_terpakai")
          .in("employee_id", balanceEmployeeIds)
          .in("tahun", balanceYears)
      : none,
    deptIds.length
      ? db
          .from("leave_requests")
          .select(
            "id, employee_id, status, tanggal_mulai, tanggal_selesai, employees!leave_requests_employee_id_fkey!inner(nama, branch_id, department_id)",
          )
          .in("status", ["pending", "approved"])
          .lte("tanggal_mulai", maxTo)
          .gte("tanggal_selesai", minFrom)
          .in("employees.department_id", deptIds)
      : none,
    deptIds.length
      ? db.from("employees").select("department_id, branch_id").eq("status", "aktif").in("department_id", deptIds)
      : none,
    deptIds.length ? db.from("departments").select("id, nama").in("id", deptIds) : none,
    // Interns get 0 annual leave (0052).
    balanceEmployeeIds.length
      ? db.from("employees").select("id, status_kontrak").in("id", balanceEmployeeIds)
      : none,
  ]);

  const err =
    schedRes.error ?? holRes.error ?? balRes.error ?? teamLeaveRes.error ?? teamRes.error ?? deptRes.error ?? kontrakRes.error;
  if (err) {
    console.error("loadLeaveReviewContext: query failed", err);
    return { ok: false, error: "Gagal memuat saldo dan jadwal tim." };
  }

  const schedules = (schedRes.data ?? []) as {
    branch_id: string;
    department_id: string | null;
    hari_kerja: number[] | null;
  }[];
  const holidays = (holRes.data ?? []) as { tanggal: string; branch_id: string | null }[];

  const magang = new Set(
    ((kontrakRes.data ?? []) as { id: string; status_kontrak: string | null }[])
      .filter((e) => isMagang(e.status_kontrak))
      .map((e) => e.id),
  );
  const balanceKey = (emp: string, year: number) => `${emp}:${year}`;
  const balances = new Map<string, { awal: number; terpakai: number }>();
  for (const b of (balRes.data ?? []) as {
    employee_id: string;
    tahun: number;
    saldo_awal: number | string | null;
    saldo_terpakai: number | string | null;
  }[]) {
    balances.set(balanceKey(b.employee_id, Number(b.tahun)), {
      awal: annualAllowance(b.saldo_awal, magang.has(b.employee_id)),
      terpakai: Number(b.saldo_terpakai ?? 0),
    });
  }

  const teamLeaves: TeamLeave[] = (
    (teamLeaveRes.data ?? []) as unknown as {
      id: string;
      employee_id: string;
      status: "pending" | "approved";
      tanggal_mulai: string;
      tanggal_selesai: string;
      employees: { nama: string; branch_id: string | null; department_id: string | null } | null;
    }[]
  ).map((l) => ({
    requestId: l.id,
    employeeId: l.employee_id,
    nama: l.employees?.nama ?? "-",
    status: l.status,
    tanggalMulai: l.tanggal_mulai,
    tanggalSelesai: l.tanggal_selesai,
    departmentId: l.employees?.department_id ?? null,
    branchId: l.employees?.branch_id ?? null,
  }));

  const teamSize = new Map<string, number>();
  for (const e of (teamRes.data ?? []) as { department_id: string; branch_id: string }[]) {
    const k = `${e.department_id}:${e.branch_id}`;
    teamSize.set(k, (teamSize.get(k) ?? 0) + 1);
  }
  const deptName = new Map(((deptRes.data ?? []) as { id: string; nama: string }[]).map((d) => [d.id, d.nama]));

  const assigned = await loadScheduleAssignments(db, requests.map((r) => r.employeeId));
  for (const r of requests) {
    const branchHolidays = holidays
      .filter((h) => h.branch_id === null || h.branch_id === r.branchId)
      .map((h) => h.tanggal);
    // Department schedule, else branch default. No schedule row → fall back to
    // Mon–Fri rather than reporting zero days.
    const schedule = r.branchId ? pickSchedule(schedules, r.branchId, r.departmentId, assigned.get(r.employeeId)) : null;
    const hariKerja = schedule?.hari_kerja ?? [1, 2, 3, 4, 5];

    const workingDays = countWorkingDays(r.tanggalMulai, r.tanggalSelesai, hariKerja, branchHolidays);
    let balance: LeaveReview["balance"] = null;
    let chargedDays: number | null = null;
    if (requiresBalanceCheck(r.jenis)) {
      const tahun = Number(r.tanggalMulai.slice(0, 4));
      const b = balances.get(balanceKey(r.employeeId, tahun));
      const awal = b?.awal ?? annualAllowance(null, magang.has(r.employeeId));
      balance = { awal, sisa: awal - (b?.terpakai ?? 0), tahun };
      chargedDays = workingDays;
    }

    byRequest.set(r.id, {
      workingDays,
      chargedDays,
      balance,
      clashes: findClashes(r, teamLeaves),
      departmentName: r.departmentId ? deptName.get(r.departmentId) ?? null : null,
      teamSize: r.departmentId ? teamSize.get(`${r.departmentId}:${r.branchId}`) ?? null : null,
    });
  }

  return { ok: true, byRequest };
}
