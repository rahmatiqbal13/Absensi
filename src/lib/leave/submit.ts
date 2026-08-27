import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveApprover } from "./approver";
import { calculateLeaveDays, requiresBalanceCheck, hasSufficientBalance } from "./balance";

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
    .select("id, role, atasan_id, designated_approver_id")
    .eq("id", input.employeeId)
    .single();
  if (employeeErr || !employee) {
    console.error("submitLeaveRequest: employee lookup failed", employeeErr);
    return { ok: false, error: "Data karyawan tidak ditemukan." };
  }

  const days = calculateLeaveDays(input.tanggalMulai, input.tanggalSelesai);

  if (requiresBalanceCheck(input.jenis)) {
    const year = Number(input.tanggalMulai.slice(0, 4));
    const { data: balance } = await db
      .from("leave_balances")
      .select("saldo_sisa")
      .eq("employee_id", input.employeeId)
      .eq("tahun", year)
      .maybeSingle();

    const saldoSisa = balance?.saldo_sisa ?? 0;
    if (!hasSufficientBalance(saldoSisa, days)) {
      return {
        ok: false,
        error: `Saldo cuti tidak mencukupi. Sisa saldo: ${saldoSisa} hari, diajukan: ${days} hari.`,
      };
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
