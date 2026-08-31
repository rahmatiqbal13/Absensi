import { notFound, redirect } from "next/navigation";
import { History } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { RoleBadge } from "@/components/role-badge";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { ResponsiveTable } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { AuditAksiBadge } from "@/components/audit-aksi-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Role } from "@/lib/auth/route-access";
import { EditEmployeeForm } from "./edit-employee-form";
import { KaryawanTabs } from "./karyawan-tabs";
import { updateEmployee, setEmployeeStatus } from "../actions";

export default async function KaryawanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  if (me.role !== "hr_admin" && me.role !== "super_admin") redirect("/dashboard");

  const { data: emp, error } = await db
    .from("employees")
    .select(
      "id, nama, email, jabatan, status_kontrak, tanggal_mulai_kerja, gaji_pokok, role, status, branch_id, department_id, atasan_id, designated_approver_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("KaryawanDetailPage: employee lookup failed", error);
    return (
      <Alert variant="destructive">
        <AlertDescription>Gagal memuat data karyawan.</AlertDescription>
      </Alert>
    );
  }
  if (!emp) notFound();

  const [
    { data: branches, error: branchesError },
    { data: departments, error: departmentsError },
    { data: approvers, error: approversError },
    { data: audit, error: auditError },
  ] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("departments").select("id, nama").order("nama"),
    db.from("employees").select("id, nama").eq("status", "aktif").order("nama"),
    db
      .from("audit_logs")
      .select("waktu, aksi, actor:employees!audit_logs_actor_id_fkey(nama)")
      .eq("target_employee_id", id)
      .order("waktu", { ascending: false })
      .limit(50),
  ]);
  if (branchesError) console.error("KaryawanDetailPage: branches lookup failed", branchesError);
  if (departmentsError) console.error("KaryawanDetailPage: departments lookup failed", departmentsError);
  if (approversError) console.error("KaryawanDetailPage: approvers lookup failed", approversError);
  if (auditError) console.error("KaryawanDetailPage: audit lookup failed", auditError);

  const auditRows = (audit ?? []).map((a) => ({
    key: `${a.waktu}-${a.aksi}`,
    aksi: a.aksi as string,
    oleh: (a.actor as unknown as { nama: string } | null)?.nama ?? "Sistem",
    waktu: a.waktu as string,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={emp.nama}
        description={emp.email}
        actions={
          <>
            <RoleBadge role={emp.role as Role} />
            <StatusPill status={emp.status as "aktif" | "nonaktif"} />
          </>
        }
      />
      <KaryawanTabs
        detailSlot={
          <EditEmployeeForm
            employeeId={emp.id}
            defaults={{
              nama: emp.nama,
              email: emp.email,
              jabatan: emp.jabatan,
              statusKontrak: emp.status_kontrak,
              tanggalMulaiKerja: emp.tanggal_mulai_kerja,
              gajiPokok: String(emp.gaji_pokok),
              role: emp.role,
              branchId: emp.branch_id,
              departmentId: emp.department_id ?? "",
              atasanId: emp.atasan_id ?? "",
              designatedApproverId: emp.designated_approver_id ?? "",
            }}
            branches={branches ?? []}
            departments={departments ?? []}
            approverOptions={approvers ?? []}
            updateEmployee={updateEmployee}
            setStatus={setEmployeeStatus}
            currentStatus={emp.status as "aktif" | "nonaktif"}
            isSelf={me.id === emp.id}
          />
        }
        riwayatSlot={
          <ResponsiveTable
            columns={[
              { key: "aksi", header: "Aksi", cell: (r) => <AuditAksiBadge aksi={r.aksi} /> },
              { key: "oleh", header: "Oleh", cell: (r) => r.oleh, mobileLabel: "Oleh" },
              {
                key: "waktu",
                header: "Waktu",
                cell: (r) =>
                  new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Jakarta",
                  }).format(new Date(r.waktu)),
                mobileLabel: "Waktu",
              },
            ]}
            rows={auditRows}
            rowKey={(r) => r.key}
            emptyState={<EmptyState icon={History} message="Belum ada riwayat." />}
          />
        }
      />
    </div>
  );
}
