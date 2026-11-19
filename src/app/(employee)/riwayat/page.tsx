import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardPen } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { monthLabel } from "@/lib/format/month";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { correctionMinDate, toJakartaHHMM } from "@/lib/attendance/correction";
import { submitAttendanceCorrection } from "../pengajuan/koreksi/actions";
import { loadEmployeeDailyReport } from "@/lib/laporan/load-employee-daily";
import type { AttendanceStatus } from "@/lib/attendance/status";
import { toRiwayatRecords } from "./records";
import {
  DayBadge,
  HistoryList,
  formatDate,
  formatTime,
  type AttendanceRecord,
  type CorrectionTag,
} from "./history-list";
import { DayDetailSheet } from "./day-detail-sheet";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export default async function RiwayatPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const { bulan } = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  // One month at a time (PRD: riwayat harian/bulanan). Default: this month (WIB).
  const thisMonth = toJakartaDateOnly(new Date()).slice(0, 7);
  const ym = bulan && MONTH_RE.test(bulan) && bulan <= thisMonth ? bulan : thisMonth;
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const today = toJakartaDateOnly(new Date());
  const minDate = correctionMinDate(today);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(lastDay).padStart(2, "0")}`;
  // Only to flag days on the list; the requests themselves live under Pengajuan > Koreksi.
  const { data: corrections, error: corrErr } = await db
    .from("attendance_corrections")
    .select("tanggal, status")
    .eq("employee_id", employee.id)
    .in("status", ["pending", "approved"])
    .gte("tanggal", monthStart)
    .lte("tanggal", monthEnd);
  if (corrErr) console.error("RiwayatPage: corrections query failed", corrErr);
  const tags: Partial<Record<string, CorrectionTag>> = {};
  for (const c of corrections ?? []) {
    // A pending request outranks an older approved one for the same day.
    if (c.status === "pending" || !tags[c.tanggal]) tags[c.tanggal] = c.status as CorrectionTag;
  }

  // Every day of the month up to today, with working days that have no
  // clock-in as "Tidak absen" — same rules as HR's per-employee report
  // (schedule / roster, holidays, approved leave, join date).
  const rangeEnd = monthEnd < today ? monthEnd : today;
  const report = await loadEmployeeDailyReport(db, employee, employee.id, monthStart, rangeEnd);
  const error = !report.ok;
  if (!report.ok) console.error("RiwayatPage: daily report failed", report.error);

  const records = report.ok ? toRiwayatRecords(report.report.rows, today) : [];
  const count = (pred: (r: AttendanceRecord) => boolean) => records.filter(pred).length;
  const hadir = (s: AttendanceStatus) => (r: AttendanceRecord) => r.kind === "hadir" && r.status === s;
  const prev = shiftMonth(ym, -1);
  const next = shiftMonth(ym, 1);
  const navClass =
    "grid size-11 place-items-center rounded-full ring-1 ring-border text-foreground hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pt-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Riwayat Absensi</h1>
        <p className="text-sm text-muted-foreground">Ketuk satu hari untuk melihat detail atau mengajukan koreksi.</p>
      </div>

      <nav aria-label="Pilih bulan" className="flex items-center justify-between gap-3">
        <Link
          href={`/riwayat?bulan=${prev}`}
          aria-label={`Bulan sebelumnya, ${monthLabel(Number(prev.slice(5)))}`}
          className={navClass}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <span className="text-base font-semibold" aria-live="polite">
          {monthLabel(m)} {y}
        </span>
        {next <= thisMonth ? (
          <Link
            href={`/riwayat?bulan=${next}`}
            aria-label={`Bulan berikutnya, ${monthLabel(Number(next.slice(5)))}`}
            className={navClass}
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
      </nav>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat riwayat. Muat ulang halaman.</AlertDescription>
        </Alert>
      ) : (
        <>
          {records.length > 0 && (
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Tepat waktu", count(hadir("tepat_waktu"))],
                ["Terlambat", count(hadir("terlambat"))],
                ["Pulang cepat", count(hadir("pulang_cepat"))],
                ["Luar lokasi", count(hadir("di_luar_lokasi"))],
                ["Tidak absen", count((r) => r.kind === "alpa")],
                ["Cuti", count((r) => r.kind === "cuti")],
              ].map(([label, n]) => (
                <div key={label} className="flex flex-col-reverse rounded-xl bg-card p-2 ring-1 ring-border">
                  <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          )}
          <HistoryList
            records={records}
            tags={tags}
            wrapRow={(r, row) =>
              r.kind !== "hadir" && r.kind !== "alpa" ? (
                row
              ) : (
                <DayDetailSheet
                  title={formatDate(r.tanggal)}
                  jamMasuk={formatTime(r.jamMasuk)}
                  jamPulang={formatTime(r.jamPulang)}
                  badge={<DayBadge record={r} />}
                  catatan={r.catatan}
                  tag={tags[r.tanggal]}
                  correction={
                    r.tanggal >= minDate
                      ? {
                          action: submitAttendanceCorrection,
                          defaults: {
                            tanggal: r.tanggal,
                            jamMasuk: toJakartaHHMM(r.jamMasuk),
                            jamPulang: toJakartaHHMM(r.jamPulang),
                          },
                          minDate,
                          maxDate: today,
                        }
                      : undefined
                  }
                >
                  {row}
                </DayDetailSheet>
              )
            }
          />
        </>
      )}

      <Link
        href="/pengajuan/koreksi"
        className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-3 text-sm ring-1 ring-border outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ClipboardPen className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">Ada hari yang tidak tercatat?</span>
          <span className="block text-muted-foreground">Ajukan dan lacak koreksi di Pengajuan</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </main>
  );
}
