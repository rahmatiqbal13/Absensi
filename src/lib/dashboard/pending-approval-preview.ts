import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingPreviewRow = {
  id: string;
  nama: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
};

type Result = { ok: true; rows: PendingPreviewRow[] } | { ok: false; error: string };

/**
 * Oldest pending leave requests for the dashboard approval card. Same scoping
 * as getPendingApprovalCount: hr_admin / super_admin see every request, any
 * other approver only the ones assigned to them.
 */
export async function getPendingApprovalPreview(
  db: SupabaseClient,
  employee: { id: string; role: string },
  limit = 3,
): Promise<Result> {
  let query = db
    .from("leave_requests")
    .select("id, jenis, tanggal_mulai, tanggal_selesai, employees!leave_requests_employee_id_fkey(nama)")
    .eq("status", "pending");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") {
    query = query.eq("approver_id", employee.id);
  }
  const { data, error } = await query.order("created_at", { ascending: true }).limit(limit);
  if (error) {
    console.error("getPendingApprovalPreview: query failed", error);
    return { ok: false, error: "Gagal memuat pengajuan." };
  }
  const rows = (data ?? []) as unknown as {
    id: string;
    jenis: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    employees: { nama: string } | null;
  }[];
  return {
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      nama: r.employees?.nama ?? "-",
      jenis: r.jenis,
      tanggalMulai: r.tanggal_mulai,
      tanggalSelesai: r.tanggal_selesai,
    })),
  };
}
