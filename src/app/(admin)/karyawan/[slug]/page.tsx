import Link from "next/link";
import { Button } from "@/components/ui/button";
import { notFound, redirect } from "next/navigation";
import { FileBarChart, History } from "lucide-react";
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
import { employeeIdBySlug, paths } from "@/lib/routing/paths";
import { EditEmployeeForm } from "./edit-employee-form";
import { KaryawanTabs } from "./karyawan-tabs";
import { updateEmployee, setEmployeeStatus, createPasswordResetLink } from "../actions";
import { ResetPasswordLinkButton } from "./reset-password-link-button";
import { ContractPanel } from "./contract-panel";
import { addContract, correctBirthDate, deleteContract } from "./contract-actions";
import { PersonalDataCard } from "./personal-data-card";
import { formatNomorPegawai, type PersonalData } from "@/lib/employees/personal-data";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import type { Contract } from "@/lib/employees/contracts";

export default async function KaryawanDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  if (me.role !== "hr_admin" && me.role !== "super_admin") redirect("/dashboard");

  const found = await employeeIdBySlug(db, slug);
  if (!found) notFound();
  // Legacy UUID link, or a slug that changed after a rename -> canonical URL.
  if (found.slug !== slug) redirect(paths.karyawan(found.slug));
  const id = found.id;

  const { data: emp, error } = await db
    .from("employees")
    .select(
      "id, nama, email, jabatan, status_kontrak, status_ptkp, tanggal_mulai_kerja, gaji_pokok, role, status, branch_id, department_id, atasan_id, designated_approver_id",
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
    { data: contracts, error: contractsError },
    { data: personal, error: personalError },
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
    db
      .from("employee_contracts")
      .select("id, jenis, tanggal_mulai, tanggal_selesai, catatan")
      .eq("employee_id", id),
    // 0056 columns, own query so a pre-migration database just hides the card.
    db
      .from("employees")
      .select("nomor_pegawai, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, alamat_ktp, alamat_domisili, pendidikan_terakhir")
      .eq("id", id)
      .maybeSingle(),
  ]);
  // Pre-0049 the table doesn't exist: show an empty contract history.
  if (contractsError) console.error("KaryawanDetailPage: contracts lookup failed", contractsError);
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
        eyebrow="Orang"
        title={emp.nama}
        description={[
          emp.email ?? "Tanpa email — belum bisa masuk aplikasi",
          !personalError && (personal as { nomor_pegawai?: string | null } | null)?.nomor_pegawai
            ? `No. pegawai ${formatNomorPegawai((personal as { nomor_pegawai: string }).nomor_pegawai)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <RoleBadge role={emp.role as Role} />
            <StatusPill status={emp.status as "aktif" | "nonaktif"} />
            <Button asChild variant="outline" size="sm">
              <Link href={paths.laporanKaryawan(found.slug)}>
                <FileBarChart className="size-4" aria-hidden="true" /> Laporan kehadiran
              </Link>
            </Button>
            {emp.status === "aktif" && (
              <ResetPasswordLinkButton
                employeeName={emp.nama}
                createLink={createPasswordResetLink.bind(null, emp.id)}
              />
            )}
          </>
        }
      />
      <KaryawanTabs
        detailSlot={
          <div className="space-y-4">
          {!personalError && personal && (
            <PersonalDataCard
              data={personal as PersonalData}
              nomorPegawai={(personal as { nomor_pegawai: string | null }).nomor_pegawai}
              correctBirthDate={correctBirthDate.bind(null, emp.id)}
            />
          )}
          <EditEmployeeForm
            employeeId={emp.id}
            defaults={{
              nama: emp.nama,
              email: emp.email,
              jabatan: emp.jabatan,
              statusKontrak: emp.status_kontrak,
              statusPtkp: emp.status_ptkp ?? "TK/0",
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
          </div>
        }
        kontrakSlot={
          <ContractPanel
            contracts={(contractsError ? [] : (contracts ?? [])) as Contract[]}
            today={toJakartaDateOnly(new Date())}
            tanggalMulaiKerja={emp.tanggal_mulai_kerja}
            addContract={addContract.bind(null, emp.id)}
            deleteContract={deleteContract.bind(null, emp.id)}
          />
        }
        riwayatSlot={
          <ResponsiveTable
            caption="Riwayat perubahan data karyawan"
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
