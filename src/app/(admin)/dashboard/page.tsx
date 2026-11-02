import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodayContext } from "@/lib/dashboard/today-context";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { getMonthlyTrend } from "@/lib/dashboard/monthly-trend";
import { getPendingApprovalCount } from "@/lib/dashboard/pending-approval-count";
import { getBranchBreakdown } from "@/lib/dashboard/branch-breakdown";
import { getTodayExceptions } from "@/lib/dashboard/today-exceptions";
import { getRecentActivity } from "@/lib/dashboard/recent-activity";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AttendanceTrendChart } from "@/components/attendance-trend-chart";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { DashboardControls } from "./dashboard-controls";
import { BranchBars, TodayBoard } from "./today-board";

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

  const { data: branches, error: branchesError } = await db
    .from("branches")
    .select("id, nama")
    .order("nama");
  if (branchesError) {
    console.error("DashboardPage: branches query failed", branchesError);
  }
  const branchList = branches ?? [];
  const branchId = branch && branchList.some((b) => b.id === branch) ? branch : undefined;
  const branchName = branchId ? branchList.find((b) => b.id === branchId)?.nama : undefined;
  const isHrAdmin = employee.role === "hr_admin" || employee.role === "super_admin";
  const showBranchBreakdown = !branchId && branchList.length > 1;

  // Access tier: migration 0009 widened `is_admin_role()` to include `atasan`,
  // so an `atasan` reaches this page and sees the org-wide *aggregates* (the
  // stat tiles, the trend, the pending-approval count, the per-branch table).
  // The *named* per-employee lists — the "Perlu perhatian" exceptions list and
  // the recent-activity feed — are hr_admin / super_admin only: `atasan` has no
  // `/karyawan` access (route-access.ts `HR_ADMIN_PATH_PREFIXES`), so naming
  // every employee here would leak the roster.
  const showExceptions = isHrAdmin;

  // getTodayContext resolves the per-branch working-day status + today's
  // approved-leave employee set once, then feeds the three attendance libs so
  // they attribute "no attendance row today" correctly (leave / holiday /
  // non-working-day precedence — mirrors src/lib/laporan/attendance-recap.ts).
  const contextRes = await getTodayContext(db, branchId);
  const ctx = contextRes.ok ? contextRes.ctx : undefined;

  const ym = toJakartaDateOnly(new Date()).slice(0, 7);
  const [summary, trend, approvals, exceptions, breakdown, activity] = await Promise.all([
    getTodaySummary(db, branchId, ctx),
    getMonthlyTrend(db, ym, branchId),
    getPendingApprovalCount(db, employee),
    showExceptions ? getTodayExceptions(db, branchId, ctx) : Promise.resolve(null),
    showBranchBreakdown ? getBranchBreakdown(db, ctx) : Promise.resolve(null),
    isHrAdmin ? getRecentActivity(db) : Promise.resolve(null),
  ]);

  const showExceptionsCard = showExceptions && exceptions;
  const twoColRow = showBranchBreakdown && showExceptionsCard;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Papan hari ini${branchName ? ` · ${branchName}` : ""}`}
        title={new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Asia/Jakarta",
        }).format(new Date())}
        actions={<DashboardControls branches={branchList} selectedBranch={branchId ?? ""} />}
      />

      {branchesError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>Gagal memuat daftar cabang.</AlertDescription>
        </Alert>
      )}

      {/* who's in */}
      {summary.ok ? (
        <TodayBoard summary={summary.summary} />
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
            <CardTitle className="text-[1.05rem]">Tren kehadiran bulan ini</CardTitle>
            <CardDescription>Jumlah hadir dan terlambat per hari.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.ok ? <AttendanceTrendChart data={trend.points} /> : <InlineError>{trend.error}</InlineError>}
          </CardContent>
        </Card>
        {approvals.ok ? (
          <section className="flex flex-col gap-4 rounded-[18px] bg-sidebar p-6 text-sidebar-foreground">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[1.05rem] font-semibold">Menunggu persetujuan</h2>
              <span className="text-[2.75rem] leading-none font-semibold tracking-[-0.04em] tabular-nums">
                {approvals.count}
              </span>
            </div>
            <p className="text-sm text-sidebar-muted">
              {approvals.count === 0
                ? "Kotak masuk bersih. Tidak ada pengajuan cuti yang menunggu."
                : "Pengajuan cuti menunggu keputusan Anda."}
            </p>
            <Button asChild variant="brand" className="mt-auto h-11">
              <Link href="/persetujuan-cuti">Tinjau semua pengajuan</Link>
            </Button>
          </section>
        ) : (
          <Card size="sm"><CardContent><InlineError>{approvals.error}</InlineError></CardContent></Card>
        )}
      </div>

      {/* per-branch + exceptions */}
      {(showBranchBreakdown || showExceptionsCard) && (
        <div className={`grid gap-4 ${twoColRow ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {showBranchBreakdown && (
            <Card>
              <CardHeader><CardTitle className="text-[1.05rem]">Per cabang · hari ini</CardTitle></CardHeader>
              <CardContent>
                {breakdown && breakdown.ok ? (
                  breakdown.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Belum ada cabang.</p>
                  ) : (
                    <BranchBars rows={breakdown.rows} />
                  )
                ) : (
                  <InlineError>{breakdown?.ok === false ? breakdown.error : "Gagal memuat."}</InlineError>
                )}
              </CardContent>
            </Card>
          )}
          {showExceptionsCard && (
            <Card>
              <CardHeader><CardTitle className="text-[1.05rem]">Perlu perhatian</CardTitle></CardHeader>
              <CardContent>
                {exceptions.ok ? (
                  exceptions.nonWorkingDay ? (
                    <p className="text-sm text-muted-foreground">Hari ini bukan hari kerja.</p>
                  ) : exceptions.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Semua karyawan hadir tepat waktu.</p>
                  ) : (
                    <ul className="flex flex-col text-sm">
                      {exceptions.rows.slice(0, 8).map((r) => (
                        <li
                          key={r.employeeId}
                          className="flex min-h-11 items-center justify-between gap-3 border-t border-hairline first:border-t-0"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[0.7rem] font-semibold"
                            >
                              {r.nama
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((w) => w[0]?.toUpperCase() ?? "")
                                .join("")}
                            </span>
                            <span className="truncate text-foreground">{r.nama}</span>
                          </span>
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
          )}
        </div>
      )}

      {/* recent activity */}
      {isHrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[1.05rem]">Aktivitas terakhir</CardTitle>
            <CardAction>
              <Link href="/pengaturan/audit" className="text-xs font-medium text-brand-text hover:underline">
                Lihat log audit
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {activity && activity.ok ? (
              activity.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
              ) : (
                <ul className="flex flex-col text-sm">
                  {activity.rows.map((a) => (
                    <li
                      key={a.id}
                      className="grid grid-cols-[110px_1fr] gap-3.5 border-t border-hairline py-2.5 first:border-t-0"
                    >
                      <span className="font-mono text-[0.8rem] text-muted-foreground">
                        {new Intl.DateTimeFormat("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(a.waktu))}
                      </span>
                      <span className="text-muted-foreground">
                        <b className="font-semibold text-foreground">{a.actorNama}</b> {a.aksi}
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
