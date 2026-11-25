import { redirect } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodayContext } from "@/lib/dashboard/today-context";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { getMonthlyTrend } from "@/lib/dashboard/monthly-trend";
import { getPendingApprovalCount } from "@/lib/dashboard/pending-approval-count";
import { getPendingApprovalPreview } from "@/lib/dashboard/pending-approval-preview";
import { formatLeaveRange, leaveJenisLabel } from "@/lib/leave/labels";
import { getBranchBreakdown } from "@/lib/dashboard/branch-breakdown";
import { getTodayExceptions } from "@/lib/dashboard/today-exceptions";
import { getRecentActivity } from "@/lib/dashboard/recent-activity";
import { getTodayRoster } from "@/lib/dashboard/today-roster";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button } from "@/components/ui/button";
import { AttendanceTrendChart } from "@/components/attendance-trend-chart";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { DashboardControls } from "./dashboard-controls";
import { BranchBars, TodayBoard } from "./today-board";

/** "Selamat pagi/siang/sore/malam" by the Jakarta wall clock. */
function greetingFor(now: Date): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now),
  );
  const part = h < 11 ? "pagi" : h < 15 ? "siang" : h < 19 ? "sore" : "malam";
  return `Selamat ${part}`;
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
  // PRD §6: an atasan sees only their own team; HR sees every branch.
  const isAtasan = employee.role === "atasan";
  let teamIds: string[] | undefined;
  if (isAtasan) {
    const { data: team, error: teamErr } = await db
      .from("employees")
      .select("id")
      .eq("atasan_id", employee.id)
      .eq("status", "aktif");
    if (teamErr) console.error("DashboardPage: team lookup failed", teamErr);
    teamIds = (team ?? []).map((t) => t.id as string);
  }
  const showBranchBreakdown = !isAtasan && !branchId && branchList.length > 1;

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
  // Named board: HR sees everyone (or the chosen branch); an atasan only their
  // own team, which they are already allowed to see by name.
  const [summary, trend, approvals, pendingPreview, exceptions, breakdown, activity, roster] = await Promise.all([
    getTodaySummary(db, branchId, ctx, teamIds),
    getMonthlyTrend(db, ym, branchId, teamIds),
    getPendingApprovalCount(db, employee),
    getPendingApprovalPreview(db, employee, 3),
    showExceptions ? getTodayExceptions(db, branchId, ctx) : Promise.resolve(null),
    showBranchBreakdown ? getBranchBreakdown(db, ctx) : Promise.resolve(null),
    isHrAdmin ? getRecentActivity(db) : Promise.resolve(null),
    isHrAdmin || isAtasan ? getTodayRoster(db, branchId, ctx, teamIds) : Promise.resolve(null),
  ]);

  const showExceptionsCard = showExceptions && exceptions;
  const twoColRow = showBranchBreakdown && showExceptionsCard;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={60_000} />
      <PageHeader
        eyebrow={`Papan hari ini${isAtasan ? " · Tim saya" : ""}${branchName ? ` · ${branchName}` : ""}`}
        title={`${greetingFor(new Date())}, ${employee.nama.split(/\s+/)[0]}`}
        description={`${new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Asia/Jakarta",
        }).format(new Date())} · Ringkasan presensi hari ini`}
        actions={<DashboardControls branches={branchList} selectedBranch={branchId ?? ""} renderedAt={new Date().toISOString()} />}
      />

      {branchesError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>Gagal memuat daftar cabang.</AlertDescription>
        </Alert>
      )}

      {/* who's in */}
      {summary.ok ? (
        <TodayBoard summary={summary.summary} roster={roster?.ok ? roster.branches : undefined} />
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
            <CardTitle><SectionTitle as="h3" marker="bg-primary">Tren kehadiran bulan ini</SectionTitle></CardTitle>
            <CardDescription>Jumlah hadir dan terlambat per hari.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.ok ? <AttendanceTrendChart data={trend.points} /> : <InlineError>{trend.error}</InlineError>}
          </CardContent>
        </Card>
        {approvals.ok ? (
          <section className="flex flex-col gap-4 rounded-[18px] bg-primary p-6 text-primary-foreground">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[1.05rem] font-semibold">Menunggu persetujuan</h2>
              <span className="text-[2.75rem] leading-none font-semibold tracking-[-0.04em] tabular-nums">
                {approvals.count}
              </span>
            </div>
            {approvals.count === 0 ? (
              <p className="text-sm text-primary-foreground/85">
                Kotak masuk bersih. Tidak ada pengajuan cuti yang menunggu.
              </p>
            ) : pendingPreview.ok ? (
              <ul className="flex flex-col">
                {pendingPreview.rows.map((p) => (
                  <li key={p.id} className="border-t border-primary-foreground/25">
                    <Link
                      href={`/persetujuan-cuti?id=${p.id}`}
                      className="flex min-h-[52px] items-center justify-between gap-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold">{p.nama}</span>
                        <span className="truncate text-[0.8rem] text-primary-foreground/85">
                          {leaveJenisLabel(p.jenis)} · {formatLeaveRange(p.tanggalMulai, p.tanggalSelesai)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-primary-foreground/85" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-primary-foreground/85">Pengajuan cuti menunggu keputusan Anda.</p>
            )}
            <Button asChild className="mt-auto h-11 bg-highlight text-highlight-foreground hover:bg-highlight/90">
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
              <CardHeader><CardTitle><SectionTitle as="h3" marker="bg-info-solid">Per cabang · hari ini</SectionTitle></CardTitle></CardHeader>
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
              <CardHeader><CardTitle><SectionTitle as="h3" marker="bg-warning-solid">Perlu perhatian</SectionTitle></CardTitle></CardHeader>
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
            <CardTitle><SectionTitle as="h3" marker="bg-leave-solid">Aktivitas terakhir</SectionTitle></CardTitle>
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
