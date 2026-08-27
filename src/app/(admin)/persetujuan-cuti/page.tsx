import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { ApprovalTable, type PendingLeaveRequest } from "./approval-table";
import { approveLeave, rejectLeave } from "./actions";

export default async function PersetujuanCutiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  let query = db
    .from("leave_requests")
    .select(
      "id, jenis, tanggal_mulai, tanggal_selesai, alasan, employees!leave_requests_employee_id_fkey(nama)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const canSeeAllRequests = employee.role === "hr_admin" || employee.role === "super_admin";
  if (!canSeeAllRequests) {
    query = query.eq("approver_id", employee.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load pending leave requests:", error);
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Persetujuan Cuti</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tinjau dan proses pengajuan cuti karyawan yang menunggu persetujuan.
          </p>
        </div>
        <p className="text-sm text-red-600">
          Gagal memuat daftar pengajuan cuti. Silakan muat ulang halaman.
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    jenis: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    alasan: string | null;
    employees: { nama: string } | null;
  }>;

  const requests: PendingLeaveRequest[] = rows.map((row) => ({
    id: row.id,
    employeeName: row.employees?.nama ?? "-",
    jenis: row.jenis,
    tanggalMulai: row.tanggal_mulai,
    tanggalSelesai: row.tanggal_selesai,
    alasan: row.alasan,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Persetujuan Cuti</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tinjau dan proses pengajuan cuti karyawan yang menunggu persetujuan.
        </p>
      </div>
      <ApprovalTable requests={requests} approveLeave={approveLeave} rejectLeave={rejectLeave} />
    </div>
  );
}
