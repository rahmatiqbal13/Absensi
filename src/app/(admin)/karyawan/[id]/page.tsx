import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { RoleBadge } from "@/components/role-badge";
import type { Role } from "@/lib/auth/route-access";
import { EditEmployeeForm } from "./edit-employee-form";
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
    return <p className="text-sm text-red-600">Gagal memuat data karyawan.</p>;
  }
  if (!emp) notFound();

  const [{ data: branches }, { data: departments }, { data: approvers }, { data: audit, error: auditError }] =
    await Promise.all([
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
  if (auditError) console.error("KaryawanDetailPage: audit lookup failed", auditError);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{emp.nama}</h1>
          <p className="mt-1 text-sm text-neutral-500">{emp.email}</p>
        </div>
        <RoleBadge role={emp.role as Role} />
        <span
          className={`rounded px-2 py-1 text-xs font-medium ${
            emp.status === "aktif" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {emp.status === "aktif" ? "Aktif" : "Nonaktif"}
        </span>
      </div>

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

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-900">Riwayat Perubahan</h2>
        {!audit || audit.length === 0 ? (
          <p className="text-sm text-neutral-500">Belum ada riwayat.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white text-sm">
            {audit.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>{a.aksi}</span>
                <span className="text-neutral-500">
                  {(a.actor as unknown as { nama: string } | null)?.nama ?? "Sistem"} ·{" "}
                  {new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Jakarta",
                  }).format(new Date(a.waktu))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
