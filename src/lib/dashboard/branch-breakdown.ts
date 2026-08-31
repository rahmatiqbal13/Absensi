import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PRESENT_STATUSES } from "@/lib/attendance/status";

type BranchRow = { branchId: string; nama: string; hadir: number; terlambat: number; alpa: number };
type Result = { ok: true; rows: BranchRow[] } | { ok: false; error: string };

export async function getBranchBreakdown(db: SupabaseClient): Promise<Result> {
  const today = toJakartaDateOnly(new Date());
  const [branchesRes, employeesRes, attendancesRes] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("employees").select("branch_id").eq("status", "aktif"),
    db.from("attendances").select("status, employees!inner(branch_id)").eq("tanggal", today),
  ]);
  const err = branchesRes.error ?? employeesRes.error ?? attendancesRes.error;
  if (err) {
    console.error("getBranchBreakdown: query failed", err);
    return { ok: false, error: "Gagal memuat ringkasan per cabang." };
  }
  const headcount = new Map<string, number>();
  for (const e of employeesRes.data ?? []) {
    const b = e.branch_id as string;
    headcount.set(b, (headcount.get(b) ?? 0) + 1);
  }
  const hadir = new Map<string, number>();
  const terlambat = new Map<string, number>();
  const rowsPerBranch = new Map<string, number>();
  for (const a of attendancesRes.data ?? []) {
    const b = (a.employees as unknown as { branch_id: string }).branch_id;
    const s = a.status as string;
    rowsPerBranch.set(b, (rowsPerBranch.get(b) ?? 0) + 1);
    if (PRESENT_STATUSES.includes(s)) hadir.set(b, (hadir.get(b) ?? 0) + 1);
    if (s === "terlambat") terlambat.set(b, (terlambat.get(b) ?? 0) + 1);
  }
  const rows: BranchRow[] = (branchesRes.data ?? []).map((b) => {
    const id = b.id as string;
    return {
      branchId: id,
      nama: b.nama as string,
      hadir: hadir.get(id) ?? 0,
      terlambat: terlambat.get(id) ?? 0,
      alpa: Math.max((headcount.get(id) ?? 0) - (rowsPerBranch.get(id) ?? 0), 0),
    };
  });
  return { ok: true, rows };
}
