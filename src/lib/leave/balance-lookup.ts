import type { SupabaseClient } from "@supabase/supabase-js";

/** Mirrors `coalesce(saldo_awal, 12)` in the approval RPC (0016). */
export const DEFAULT_SALDO_AWAL = 12;

/**
 * The allowance the approval RPC (0052) checks against: 0 while the employee
 * is an intern (status magang), otherwise the stored saldo_awal or 12.
 */
export function annualAllowance(saldoAwal: number | string | null | undefined, magang: boolean): number {
  if (magang) return 0;
  return saldoAwal == null ? DEFAULT_SALDO_AWAL : Number(saldoAwal);
}

export type LeaveBalance = { tahun: number; awal: number; terpakai: number; sisa: number };

/**
 * Annual-leave balance for one employee and year. A missing row means nothing
 * has been used yet: the full default allowance — the same rule the approval
 * RPC applies, so submit-time and approve-time checks agree.
 */
export async function getLeaveBalance(
  db: SupabaseClient,
  employeeId: string,
  tahun: number,
  opts: { magang?: boolean } = {},
): Promise<{ ok: true; balance: LeaveBalance } | { ok: false; error: unknown }> {
  const { data, error } = await db
    .from("leave_balances")
    .select("saldo_awal, saldo_terpakai")
    .eq("employee_id", employeeId)
    .eq("tahun", tahun)
    .maybeSingle();
  if (error) return { ok: false, error };
  const awal = annualAllowance(data?.saldo_awal, opts.magang === true);
  const terpakai = Number(data?.saldo_terpakai ?? 0);
  return { ok: true, balance: { tahun, awal, terpakai, sisa: awal - terpakai } };
}
