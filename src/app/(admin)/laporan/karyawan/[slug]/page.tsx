import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Download, FileBarChart, TriangleAlert } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { employeeIdBySlug, paths } from "@/lib/routing/paths";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { validateRecapRange } from "@/lib/laporan/validate-range";
import { loadEmployeeDailyReport } from "@/lib/laporan/load-employee-daily";
import {
  summarizeDaily,
  formatJamWib,
  formatDurasiSingkat,
  dailyStatusLabel,
  locationFlagsLabel,
  type DailyRow,
} from "@/lib/laporan/employee-daily";
import type { AttendanceStatus } from "@/lib/attendance/status";
import { PageHeader } from "@/components/page-header";
import { ResponsiveTable } from "@/components/responsive-table";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AttendanceCorrectionDialog } from "@/components/attendance-correction-dialog";
import { toJakartaHHMMSS } from "@/lib/attendance/correction";
import { hrCorrectAttendanceAction } from "../../../persetujuan-koreksi/actions";
import { AttendanceEvidenceDialog } from "@/components/attendance-evidence-dialog";
import { getAttendanceEvidence } from "./actions";

const HR_CORRECTION_COPY = {
  title: "Koreksi absensi",
  description:
    "Perubahan langsung diterapkan tanpa persetujuan dan tercatat di audit log. Status dihitung ulang dari jadwal kerja karyawan.",
  submitLabel: "Simpan koreksi",
  successMessage: "Absensi dikoreksi.",
};

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const ATT_STATUSES = new Set(["tepat_waktu", "terlambat", "pulang_cepat", "di_luar_lokasi", "alpa"]);

function tanggalLabel(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  const tgl = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(dt);
  return `${HARI[dt.getUTCDay()]}, ${tgl}`;
}

function StatusBadge({ r }: { r: DailyRow }) {
  if ((r.kind === "hadir" || r.kind === "alpa") && r.status && ATT_STATUSES.has(r.status)) {
    return <AttendanceStatusBadge status={r.status as AttendanceStatus} />;
  }
  return <Badge variant={r.kind === "cuti" ? "leave" : "neutral"}>{dailyStatusLabel(r)}</Badge>;
}

function StatusCell({ r }: { r: DailyRow }) {
  if (r.flagLokasi.length === 0) return <StatusBadge r={r} />;
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusBadge r={r} />
      <span className="flex max-w-[24ch] items-start gap-1 text-xs text-warning-foreground">
        <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">Peringatan lokasi: </span>
          {locationFlagsLabel(r.flagLokasi)}
        </span>
      </span>
    </span>
  );
}

const mins = (n: number) => (n > 0 ? `${n} mnt` : "—");

export default async function LaporanKaryawanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dari?: string; sampai?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const viewer = await getCurrentEmployee(db);
  if (!viewer) redirect("/login");
  if (viewer.role === "karyawan") redirect("/absen");

  const found = await employeeIdBySlug(db, slug);
  if (!found) notFound();
  if (found.slug !== slug) {
    const keep = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(paths.laporanKaryawan(found.slug) + (keep.size ? `?${keep}` : ""));
  }
  const id = found.id;

  const today = toJakartaDateOnly(new Date());
  const dari = sp.dari || `${today.slice(0, 7)}-01`;
  const sampai = sp.sampai || today;
  const range = validateRecapRange(dari, sampai);

  const res = range.ok ? await loadEmployeeDailyReport(db, viewer, id, range.from, range.to) : null;
  if (res && !res.ok && res.status === 404) notFound();

  const report = res?.ok ? res.report : null;
  // HR only, and never on one's own record (that goes through the approval flow).
  const isHr = viewer.role === "hr_admin" || viewer.role === "super_admin";
  const canCorrect = isHr && viewer.id !== id;
  // Selfies + positions: HR only (biometric data, UU PDP), not atasan.
  const canViewEvidence = isHr;
  const correct = hrCorrectAttendanceAction.bind(null, id);
  const summary = report ? summarizeDaily(report.rows) : null;
  const qs = new URLSearchParams({ dari, sampai }).toString();
  const sched = report?.schedule;
  const hariKerja = sched
    ? [1, 2, 3, 4, 5, 6, 0].filter((d) => sched.hariKerja.includes(d)).map((d) => HARI[d]).join(", ")
    : null;

  return (
    <div className="space-y-6">
      <Link
        href={`/laporan?${qs}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-text"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Laporan kehadiran
      </Link>

      <PageHeader
        eyebrow="Angka · Per karyawan"
        title={report?.employee.nama ?? "Laporan karyawan"}
        description={
          report
            ? [
                report.employee.jabatan,
                report.employee.departemen,
                report.employee.cabang,
                sched ? `Jadwal ${sched.jamMasuk}–${sched.jamPulang} (${hariKerja})` : "Belum ada jadwal kerja",
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={
          report ? (
            <>
              {canCorrect && (
                <AttendanceCorrectionDialog
                  action={correct}
                  defaults={{ tanggal: today }}
                  maxDate={today}
                  triggerLabel="Koreksi absensi"
                  {...HR_CORRECTION_COPY}
                />
              )}
              <Button asChild variant="outline" size="sm">
                <a href={`${paths.laporanKaryawan(slug)}/pdf?${qs}`}>
                  <Download className="size-4" /> Unduh PDF
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`${paths.laporanKaryawan(slug)}/csv?${qs}`}>
                  <Download className="size-4" /> Unduh CSV
                </a>
              </Button>
            </>
          ) : undefined
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] bg-secondary p-4" role="search">
        <label className="flex flex-col gap-1.5 text-[0.8rem] font-semibold">
          Dari
          <Input type="date" name="dari" defaultValue={dari} className="h-10 w-44" />
        </label>
        <label className="flex flex-col gap-1.5 text-[0.8rem] font-semibold">
          Sampai
          <Input type="date" name="sampai" defaultValue={sampai} className="h-10 w-44" />
        </label>
        <Button type="submit" className="h-10 px-4">Tampilkan</Button>
      </form>

      {!range.ok && (
        <Alert variant="destructive">
          <AlertDescription>{range.error}</AlertDescription>
        </Alert>
      )}
      {res && !res.ok && (
        <Alert variant="destructive">
          <AlertDescription>{res.error}</AlertDescription>
        </Alert>
      )}

      {report && summary && (
        <>
          <dl className="grid grid-cols-2 border-t border-foreground sm:grid-cols-4 lg:grid-cols-8">
            {(
              [
                ["Hari kerja", String(summary.hariKerja), ""],
                ["Hadir", String(summary.hadir), "text-success-foreground"],
                ["Terlambat", `${summary.terlambat}× · ${summary.menitTerlambat} mnt`, "text-warning-foreground"],
                ["Pulang cepat", `${summary.pulangCepat}× · ${summary.menitPulangCepat} mnt`, "text-early-foreground"],
                ["Di luar lokasi", String(summary.diLuarLokasi), "text-info-foreground"],
                ["Alpa", String(summary.alpa), "text-danger-foreground"],
                ["Cuti", String(summary.cuti), "text-leave-foreground"],
                ["Jam kerja", formatDurasiSingkat(summary.menitKerja), ""],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="flex flex-col-reverse gap-1 border-b border-border px-1 py-4">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={`font-mono text-xl font-semibold tabular-nums ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
          {summary.menitLembur > 0 && (
            <p className="text-sm text-muted-foreground">
              Lembur tercatat: <b className="text-foreground">{formatDurasiSingkat(summary.menitLembur)}</b>
            </p>
          )}

          <ResponsiveTable
            caption={`Kehadiran harian ${report.employee.nama}, ${dari} s.d. ${sampai}`}
            columns={[
              { key: "tgl", header: "Tanggal", cell: (r: DailyRow) => <span className="whitespace-nowrap font-medium">{tanggalLabel(r.tanggal)}</span> },
              { key: "status", header: "Status", cell: (r: DailyRow) => <StatusCell r={r} />, mobileLabel: "Status" },
              { key: "masuk", header: "Masuk", cell: (r: DailyRow) => <span className="font-mono tabular-nums">{formatJamWib(r.jamMasuk)}</span>, mobileLabel: "Masuk" },
              { key: "pulang", header: "Pulang", cell: (r: DailyRow) => <span className="font-mono tabular-nums">{formatJamWib(r.jamPulang)}</span>, mobileLabel: "Pulang" },
              { key: "durasi", header: "Durasi", align: "right", cell: (r: DailyRow) => <span className="font-mono tabular-nums">{formatDurasiSingkat(r.durasiMenit)}</span>, mobileLabel: "Durasi" },
              { key: "telat", header: "Terlambat", align: "right", cell: (r: DailyRow) => <span className={r.menitTerlambat ? "text-warning-foreground" : "text-muted-foreground"}>{mins(r.menitTerlambat)}</span>, mobileLabel: "Terlambat" },
              { key: "pc", header: "Pulang cepat", align: "right", cell: (r: DailyRow) => <span className={r.menitPulangCepat ? "text-early-foreground" : "text-muted-foreground"}>{mins(r.menitPulangCepat)}</span>, mobileLabel: "Pulang cepat" },
              { key: "lembur", header: "Lembur", align: "right", cell: (r: DailyRow) => <span className={r.menitLembur ? "" : "text-muted-foreground"}>{mins(r.menitLembur)}</span>, mobileLabel: "Lembur" },
              {
                key: "ket",
                header: "Keterangan",
                mobileLabel: "Keterangan",
                cell: (r: DailyRow) =>
                  r.keterangan || r.catatan || r.shift ? (
                    <span className="flex max-w-[28ch] flex-col text-sm">
                      {r.shift && <span>Shift {r.shift}</span>}
                      {r.keterangan && <span>{r.keterangan}</span>}
                      {r.catatan && <span className="text-muted-foreground italic">“{r.catatan}”</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              ...(canCorrect || canViewEvidence
                ? [
                    {
                      key: "aksi",
                      header: "",
                      cell: (r: DailyRow) => (
                        <span className="flex flex-wrap items-center justify-end gap-1">
                          {canViewEvidence && r.kind === "hadir" && r.jamMasuk && (
                            <AttendanceEvidenceDialog
                              tanggalLabel={tanggalLabel(r.tanggal)}
                              load={getAttendanceEvidence.bind(null, id, r.tanggal)}
                            />
                          )}
                          {canCorrect && r.tanggal <= today && r.kind !== "cuti" && (
                            <AttendanceCorrectionDialog
                              action={correct}
                              defaults={{
                                tanggal: r.tanggal,
                                jamMasuk: toJakartaHHMMSS(r.jamMasuk),
                                jamPulang: toJakartaHHMMSS(r.jamPulang),
                              }}
                              maxDate={today}
                              trigger="link"
                              triggerLabel="Koreksi"
                              {...HR_CORRECTION_COPY}
                            />
                          )}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
            rows={report.rows}
            rowKey={(r) => r.tanggal}
            emptyState={<EmptyState icon={FileBarChart} message="Tidak ada data untuk rentang ini." />}
          />
        </>
      )}
    </div>
  );
}
