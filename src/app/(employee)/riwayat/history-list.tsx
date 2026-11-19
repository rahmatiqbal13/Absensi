import { ClipboardList } from "lucide-react";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import type { AttendanceStatus } from "@/lib/attendance/status";

export type AttendanceRecord = {
  tanggal: string;
  jamMasuk: string | null;
  jamPulang: string | null;
  status: AttendanceStatus;
  catatan: string | null;
};

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
  /** Wraps each row, e.g. to make it open a detail sheet. */
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
              <span className="font-mono text-sm text-muted-foreground tabular-nums">
                {formatTime(record.jamMasuk)} – {formatTime(record.jamPulang)}
              </span>
              {record.catatan && <span className="truncate text-xs text-muted-foreground">{record.catatan}</span>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <AttendanceStatusBadge status={record.status} />
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
