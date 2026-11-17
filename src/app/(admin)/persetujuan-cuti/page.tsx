import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loadLeaveReviewContext } from "@/lib/leave/review-context";
import { ApprovalList, type PendingLeaveRequest } from "./approval-list";
import { approveLeave, rejectLeave } from "./actions";

export default async function PersetujuanCutiPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: initialSelectedId } = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  let query = db
    .from("leave_requests")
    .select(
      "id, employee_id, jenis, tanggal_mulai, tanggal_selesai, alasan, employees!leave_requests_employee_id_fkey(nama, jabatan, branch_id, department_id, branches(nama))",
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
        <PageHeader
        eyebrow="Kotak masuk"
          title="Persetujuan Cuti"
          description="Tinjau dan proses pengajuan cuti karyawan yang menunggu persetujuan."
        />
        <Alert variant="destructive">
          <AlertDescription>
            Gagal memuat daftar pengajuan cuti. Silakan muat ulang halaman.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    employee_id: string;
    jenis: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    alasan: string | null;
    employees: {
      nama: string;
      jabatan: string | null;
      branch_id: string | null;
      department_id: string | null;
      branches: { nama: string } | null;
    } | null;
  }>;

  // Balance, working days and team clashes are a review aid: if they fail to
  // load, the requests are still listed and decidable.
  const review = await loadLeaveReviewContext(
    db,
    rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      branchId: r.employees?.branch_id ?? null,
      departmentId: r.employees?.department_id ?? null,
      jenis: r.jenis,
      tanggalMulai: r.tanggal_mulai,
      tanggalSelesai: r.tanggal_selesai,
    })),
  );

  const requests: PendingLeaveRequest[] = rows.map((row) => {
    const ctx = review.ok ? review.byRequest.get(row.id) : undefined;
    return {
      id: row.id,
      employeeName: row.employees?.nama ?? "-",
      meta: [row.employees?.jabatan, ctx?.departmentName, row.employees?.branches?.nama]
        .filter(Boolean)
        .join(" · "),
      jenis: row.jenis,
      tanggalMulai: row.tanggal_mulai,
      tanggalSelesai: row.tanggal_selesai,
      alasan: row.alasan,
      review: ctx ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Kotak masuk"
        title="Persetujuan Cuti"
        description="Tinjau dan proses pengajuan cuti karyawan yang menunggu persetujuan."
      />
      {!review.ok && (
        <Alert variant="warning">
          <AlertDescription>{review.error} Pengajuan tetap bisa diproses.</AlertDescription>
        </Alert>
      )}
      <ApprovalList
        requests={requests}
        approveLeave={approveLeave}
        rejectLeave={rejectLeave}
        initialSelectedId={initialSelectedId}
      />
    </div>
  );
}
