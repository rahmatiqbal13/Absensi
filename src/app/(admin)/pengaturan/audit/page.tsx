import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { AuditAksiBadge } from "@/components/audit-aksi-badge";
import { PageHeader } from "@/components/page-header";
import { ResponsiveTable } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollText } from "lucide-react";
import { AuditFilters } from "./audit-filters";
import { AuditDetailPopover } from "./audit-detail-popover";

const fmt = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string; target?: string; aksi?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: employees, error: employeesError } = await db
    .from("employees")
    .select("id, nama")
    .order("nama");
  if (employeesError) console.error("audit: gagal memuat daftar karyawan", employeesError);

  let q = db
    .from("audit_logs")
    .select(
      "id, waktu, aksi, detail, is_self_action, actor:employees!audit_logs_actor_id_fkey(nama), target:employees!audit_logs_target_employee_id_fkey(nama)",
    )
    .order("waktu", { ascending: false })
    .limit(100);
  if (sp.dari) q = q.gte("waktu", `${sp.dari}T00:00:00+07:00`);
  if (sp.sampai) {
    const end = new Date(`${sp.sampai}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt("waktu", `${end.toISOString().slice(0, 10)}T00:00:00+07:00`);
  }
  if (sp.target) q = q.eq("target_employee_id", sp.target);
  if (sp.aksi) q = q.eq("aksi", sp.aksi);

  const { data: rows, error } = await q;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Audit"
        description="Riwayat perubahan data karyawan dan persetujuan cuti."
      />

      <AuditFilters employees={employees ?? []} defaults={sp} />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat log audit.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            {
              key: "waktu",
              header: "Waktu",
              cellClassName: "whitespace-nowrap",
              cell: (r) => fmt.format(new Date(r.waktu)),
            },
            { key: "aksi", header: "Aksi", mobileLabel: "Aksi", cell: (r) => <AuditAksiBadge aksi={r.aksi} /> },
            {
              key: "aktor",
              header: "Aktor",
              mobileLabel: "Aktor",
              cell: (r) => (
                <>
                  {(r.actor as unknown as { nama: string } | null)?.nama ?? "Sistem"}
                  {r.is_self_action && (
                    <span className="ml-1 text-xs text-muted-foreground">(aksi sendiri)</span>
                  )}
                </>
              ),
            },
            {
              key: "target",
              header: "Target",
              mobileLabel: "Target",
              cell: (r) => (r.target as unknown as { nama: string } | null)?.nama ?? "-",
            },
            {
              key: "detail",
              header: "Detail",
              align: "right",
              cell: (r) => <AuditDetailPopover detail={r.detail} />,
            },
          ]}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          caption="Log audit"
          emptyState={<EmptyState icon={ScrollText} message="Belum ada catatan audit." />}
        />
      )}
    </div>
  );
}
