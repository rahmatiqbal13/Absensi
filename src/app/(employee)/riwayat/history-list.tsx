import { CalendarOff, ClipboardList, Palmtree, XCircle } from "lucide-react";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import type { AttendanceStatus } from "@/lib/attendance/status";

export type AttendanceRecord = {
  tanggal: string;
  /**
   * hadir = a clock-in row; alpa = a working day with no clock-in ("Tidak
   * absen"); cuti / libur = covered by approved leave or a holiday. Defaults
   * to hadir.
   */
  kind?: "hadir" | "alpa" | "cuti" | "libur";
  jamMasuk: string | null;
  jamPulang: string | null;
  status: AttendanceStatus;
  catatan: string | null;
  /** Leave type or holiday name for cuti / libur days. */
  keterangan?: string | null;
};

/** The status pill for a day, by kind. */
export function DayBadge({ record }: { record: AttendanceRecord }) {
  switch (record.kind ?? "hadir") {
    case "alpa":
      return (
        <Badge variant="danger" className="gap-1">
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Tidak absen
        </Badge>
      );
    case "cuti":
      return (
        <Badge variant="leave" className="gap-1">
          <Palmtree className="h-3.5 w-3.5" aria-hidden="true" />
          Cuti
        </Badge>
      );
    case "libur":
      return (
        <Badge variant="neutral" className="gap-1">
          <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" />
          Libur
        </Badge>
      );
    default:
      return <AttendanceStatusBadge status={record.status} />;
  }
}

function secondLine(record: AttendanceRecord): string {
  switch (record.kind ?? "hadir") {
    case "alpa":
      return "Tidak ada catatan absen";
    case "cuti":
    case "libur":
      return record.keterangan ?? "";
    default:
      return `${formatTime(record.jamMasuk)} – ${formatTime(record.jamPulang)}`;
  }
}

/** The latest open/applied correction for a day, shown as a small flag on the row. */
export type CorrectionTag = "pending" | "approved";

export const CORRECTION_TAG_LABEL: Record<CorrectionTag, string> = {
  pending: "Koreksi menunggu",
  approved: "Dikoreksi",
};

// `HistoryList` renders inside a Server Component with no `"use client"`
// directive, so `formatTime` executes in the Node server process using
// whatever timezone that process happens to be configured with — not
// necessarily Asia/Jakarta. Without an explicit `timeZone`, `toLocaleTimeString`
// reads the instant in the EXECUTING PROCESS's local timezone, not any
// timezone implied by how the ISO string was written. On a UTC-default
// cloud/serverless deployment, a clock-in stored as 09:00 WIB (02:00Z) would
// render as "02.00" instead of "09.00". Pinning `timeZone: "Asia/Jakarta"`
// makes the result independent of the process's own TZ configuration — same
// pattern as jakarta-date.ts and status.ts.
export function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function formatDate(dateOnly: string, weekday: "long" | "short" = "long"): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday,
    day: "numeric",
    month: weekday === "long" ? "long" : "short",
    ...(weekday === "long" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function HistoryList({
  records,
  tags = {},
  wrapRow,
}: {
  records: AttendanceRecord[];
  tags?: Partial<Record<string, CorrectionTag>>;
  /** Wraps a row, e.g. to make it open a detail sheet (return the row as-is to leave it static). */
  wrapRow?: (record: AttendanceRecord, row: React.ReactNode) => React.ReactNode;
}) {
  if (records.length === 0) {
    return <EmptyState icon={ClipboardList} message="Belum ada riwayat absensi." />;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
      {records.map((record) => {
        const tag = tags[record.tanggal];
        const row = (
          <div className="flex items-center gap-3 px-3.5 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{formatDate(record.tanggal, "short")}</span>
              <span
                className={
                  (record.kind ?? "hadir") === "hadir"
                    ? "font-mono text-sm text-muted-foreground tabular-nums"
                    : "text-sm text-muted-foreground"
                }
              >
                {secondLine(record)}
              </span>
              {record.catatan && <span className="truncate text-xs text-muted-foreground">{record.catatan}</span>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <DayBadge record={record} />
              {tag && (
                <Badge variant={tag === "pending" ? "warning" : "neutral"} className="text-[0.7rem]">
                  {CORRECTION_TAG_LABEL[tag]}
                </Badge>
              )}
            </div>
          </div>
        );
        return <li key={record.tanggal}>{wrapRow ? wrapRow(record, row) : row}</li>;
      })}
    </ul>
  );
}
