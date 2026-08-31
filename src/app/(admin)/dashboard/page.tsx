import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { getMonthlyTrend } from "@/lib/dashboard/monthly-trend";
import { getPendingApprovalCount } from "@/lib/dashboard/pending-approval-count";
import { getBranchBreakdown } from "@/lib/dashboard/branch-breakdown";
import { getTodayExceptions } from "@/lib/dashboard/today-exceptions";
import { getRecentActivity } from "@/lib/dashboard/recent-activity";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ResponsiveTable } from "@/components/responsive-table";
import { AttendanceTrendChart } from "@/components/attendance-trend-chart";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { DashboardControls } from "./dashboard-controls";

function pct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function InlineError({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-destructive">{children}</p>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const branchList = branches ?? [];
  const branchId = branch && branchList.some((b) => b.id === branch) ? branch : undefined;
  const branchName = branchId ? branchList.find((b) => b.id === branchId)?.nama : undefined;
  const isHrAdmin = employee.role === "hr_admin" || employee.role === "super_admin";
  const showBranchBreakdown = !branchId && branchList.length > 1;

  const ym = toJakartaDateOnly(new Date()).slice(0, 7);
  const [summary, trend, approvals, exceptions, breakdown, activity] = await Promise.all([
    getTodaySummary(db, branchId),
    getMonthlyTrend(db, ym, branchId),
    getPendingApprovalCount(db, employee),
    getTodayExceptions(db, branchId),
    showBranchBreakdown ? getBranchBreakdown(db) : Promise.resolve(null),
    isHrAdmin ? getRecentActivity(db) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Ringkasan kehadiran hari ini${branchName ? ` · ${branchName}` : ""}`}
        actions={<DashboardControls branches={branchList} selectedBranch={branchId ?? ""} />}
      />

      {/* stat row */}
      {summary.ok ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Hadir" value={summary.summary.hadir} sublabel={pct(summary.summary.hadir, summary.summary.total)} />
          <StatCard label="Terlambat" value={summary.summary.terlambat} tone="warning" />
          <StatCard label="Pulang Cepat" value={summary.summary.pulangCepat} />
          <StatCard label="Di Luar Lokasi" value={summary.summary.diLuarLokasi} />
          <StatCard label="Alpa" value={summary.summary.alpa} tone="destructive" />
          <StatCard label="Cuti" value={summary.summary.cuti} />
        </div>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{summary.error}</AlertDescription>
        </Alert>
      )}

      {/* trend + approvals */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tren Kehadiran Bulan Ini</CardTitle>
            <CardDescription>Jumlah hadir dan terlambat per hari.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.ok ? <AttendanceTrendChart data={trend.points} /> : <InlineError>{trend.error}</InlineError>}
          </CardContent>
        </Card>
        {approvals.ok ? (
          <StatCard
            label="Menunggu persetujuan"
            value={approvals.count}
            sublabel="Tinjau pengajuan cuti →"
            tone="accent"
            href="/persetujuan-cuti"
          />
        ) : (
          <Card size="sm"><CardContent><InlineError>{approvals.error}</InlineError></CardContent></Card>
        )}
      </div>

      {/* per-branch + exceptions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {showBranchBreakdown && (
          <Card>
            <CardHeader><CardTitle>Per Cabang · hari ini</CardTitle></CardHeader>
            <CardContent>
              {breakdown && breakdown.ok ? (
                <ResponsiveTable
                  columns={[
                    { key: "nama", header: "Cabang", cell: (r) => r.nama },
                    { key: "hadir", header: "Hadir", align: "right", cell: (r) => r.hadir },
                    { key: "terlambat", header: "Terlambat", align: "right", cell: (r) => r.terlambat },
                    { key: "alpa", header: "Alpa", align: "right", cell: (r) => r.alpa },
                  ]}
                  rows={breakdown.rows}
                  rowKey={(r) => r.branchId}
                  emptyState={<p className="text-sm text-muted-foreground">Belum ada cabang.</p>}
                />
              ) : (
                <InlineError>{breakdown?.ok === false ? breakdown.error : "Gagal memuat."}</InlineError>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Perlu perhatian · hari ini</CardTitle></CardHeader>
          <CardContent>
            {exceptions.ok ? (
              exceptions.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Semua karyawan hadir tepat waktu.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {exceptions.rows.slice(0, 8).map((r) => (
                    <li key={r.employeeId} className="flex items-center justify-between gap-2">
                      <span className="text-foreground">{r.nama}</span>
                      <AttendanceStatusBadge status={r.status} />
                    </li>
                  ))}
                  {exceptions.rows.length > 8 && (
                    <li className="text-xs text-muted-foreground">
                      + {exceptions.rows.length - 8} lainnya
                    </li>
                  )}
                </ul>
              )
            ) : (
              <InlineError>{exceptions.error}</InlineError>
            )}
          </CardContent>
        </Card>
      </div>

      {/* recent activity */}
      {isHrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Aktivitas Terakhir</CardTitle>
            <CardAction>
              <Link href="/pengaturan/audit" className="text-xs text-primary hover:underline">
                Lihat semua
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {activity && activity.ok ? (
              activity.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {activity.rows.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                      <span className="text-foreground">{a.actorNama}</span>
                      <span>{a.aksi}</span>
                      <span className="text-xs">
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(a.waktu))}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <InlineError>{activity?.ok === false ? activity.error : "Gagal memuat."}</InlineError>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
