import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveApprover } from "./approver";
import { calculateLeaveDays, countWorkingDays, hasSufficientBalance, leaveChargeByYear, requiresBalanceCheck } from "./balance";
import { getLeaveBalance } from "./balance-lookup";
import { annualLeaveEligibleFrom, requiresAttachment } from "./eligibility";
import { isMagang } from "@/lib/employees/contracts";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LEAVE_CALENDAR_DAYS = 366;

export type SubmitLeaveInput = {
  employeeId: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  alasan?: string;
  lampiranUrl?: string;
};

export type SubmitLeaveResult = { ok: true; requestId: string } | { ok: false; error: string };

export async function submitLeaveRequest(
  db: SupabaseClient,
  input: SubmitLeaveInput,
): Promise<SubmitLeaveResult> {
  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .select("id, role, atasan_id, designated_approver_id, tanggal_mulai_kerja, status_kontrak, branch_id, department_id")
    .eq("id", input.employeeId)
    .single();
  if (employeeErr || !employee) {
    console.error("submitLeaveRequest: employee lookup failed", employeeErr);
    return { ok: false, error: "Data karyawan tidak ditemukan." };
  }

  const validDate = (d: string) => DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (!validDate(input.tanggalMulai) || !validDate(input.tanggalSelesai) || input.tanggalSelesai < input.tanggalMulai) {
    return { ok: false, error: "Tanggal cuti tidak valid." };
  }
  const days = calculateLeaveDays(input.tanggalMulai, input.tanggalSelesai);
  if (days > MAX_LEAVE_CALENDAR_DAYS) {
    return { ok: false, error: "Rentang cuti maksimal 1 tahun. Ajukan per bagian bila lebih lama." };
  }

  // One leave per day: a duplicate submit would otherwise be approved twice
  // and charge the balance twice (approval refuses it too, 0069).
  const { data: clash, error: clashErr } = await db
    .from("leave_requests")
    .select("id")
    .eq("employee_id", input.employeeId)
    .in("status", ["pending", "approved"])
    .lte("tanggal_mulai", input.tanggalSelesai)
    .gte("tanggal_selesai", input.tanggalMulai)
    .limit(1);
  if (clashErr) {
    console.error("submitLeaveRequest: overlap check failed", clashErr);
    return { ok: false, error: "Gagal memeriksa pengajuan cuti yang ada." };
  }
  if (clash?.length) {
    return { ok: false, error: "Sudah ada pengajuan cuti (menunggu atau disetujui) pada tanggal tersebut." };
  }

  if (requiresAttachment(input.jenis, days) && !input.lampiranUrl) {
    return { ok: false, error: "Cuti sakit lebih dari 1 hari wajib melampirkan surat dokter." };
  }

  if (input.jenis === "tahunan") {
    // PRD §6: annual leave only after 12 consecutive months of service.
    const eligibleFrom = annualLeaveEligibleFrom(employee.tanggal_mulai_kerja ?? null);
    if (eligibleFrom && input.tanggalMulai < eligibleFrom) {
      const label = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${eligibleFrom}T00:00:00Z`));
      return {
        ok: false,
        error: `Cuti tahunan berlaku setelah 12 bulan bekerja, yaitu mulai ${label}.`,
      };
    }
  }

  if (requiresBalanceCheck(input.jenis)) {
    const magang = isMagang(employee.status_kontrak);
    if (magang) {
      return { ok: false, error: "Anak magang tidak mendapat jatah cuti tahunan. Gunakan izin khusus atau cuti sakit." };
    }

    // Charged in working days of the employee's own schedule, minus holidays,
    // each year's part to that year's balance — as approve_leave_request (0069).
    const [sched, hol] = await Promise.all([
      loadEmployeeSchedule<{ hari_kerja: number[] | null }>(
        db, "hari_kerja", employee.branch_id, employee.department_id, employee.id,
      ),
      db.from("holidays").select("tanggal, branch_id").gte("tanggal", input.tanggalMulai).lte("tanggal", input.tanggalSelesai),
    ]);
    if (sched.error || hol.error) {
      console.error("submitLeaveRequest: schedule/holiday lookup failed", sched.error ?? hol.error);
      return { ok: false, error: "Gagal menghitung hari kerja cuti." };
    }
    const hariKerja = sched.data?.hari_kerja ?? [1, 2, 3, 4, 5];
    const holidays = ((hol.data ?? []) as { tanggal: string; branch_id: string | null }[])
      .filter((h) => h.branch_id === null || h.branch_id === employee.branch_id)
      .map((h) => h.tanggal);
    if (countWorkingDays(input.tanggalMulai, input.tanggalSelesai, hariKerja, holidays) === 0) {
      return { ok: false, error: "Tidak ada hari kerja pada tanggal tersebut, jadi tidak perlu cuti." };
    }

    for (const [year, charge] of leaveChargeByYear(input.tanggalMulai, input.tanggalSelesai, hariKerja, holidays)) {
      const res = await getLeaveBalance(db, input.employeeId, year, { magang });
      if (!res.ok) {
        console.error("submitLeaveRequest: leave_balances lookup failed", res.error);
        return { ok: false, error: "Gagal memeriksa saldo cuti." };
      }
      if (!hasSufficientBalance(res.balance.sisa, charge)) {
        return {
          ok: false,
          error: `Saldo cuti ${year} tidak mencukupi. Sisa saldo: ${res.balance.sisa} hari, diajukan: ${charge} hari kerja.`,
        };
      }
    }
  }

  const { approverId, isSelfRequest } = resolveApprover({
    id: employee.id,
    role: employee.role,
    atasanId: employee.atasan_id,
    designatedApproverId: employee.designated_approver_id,
  });

  const { data: inserted, error: insertErr } = await db
    .from("leave_requests")
    .insert({
      employee_id: input.employeeId,
      jenis: input.jenis,
      tanggal_mulai: input.tanggalMulai,
      tanggal_selesai: input.tanggalSelesai,
      alasan: input.alasan ?? null,
      lampiran_url: input.lampiranUrl ?? null,
      approver_id: approverId,
      is_self_request: isSelfRequest,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    console.error("submitLeaveRequest: insert failed", insertErr);
    return { ok: false, error: "Gagal mengajukan cuti." };
  }

  return { ok: true, requestId: inserted.id };
}
