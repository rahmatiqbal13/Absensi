import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { EmptyState } from "@/components/empty-state";
import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AttendanceStatus } from "@/lib/attendance/status";

export type AttendanceRecord = {
  tanggal: string;
  jamMasuk: string | null;
  jamPulang: string | null;
  status: AttendanceStatus;
  catatan: string | null;
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
function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function HistoryList({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <EmptyState icon={ClipboardList} message="Belum ada riwayat absensi." />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {records.map((record) => (
        <li key={record.tanggal}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{formatDate(record.tanggal)}</span>
                <AttendanceStatusBadge status={record.status} />
              </div>
              <span className="text-sm text-muted-foreground">
                {formatTime(record.jamMasuk)} – {formatTime(record.jamPulang)}
              </span>
              {record.catatan && (
                <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">
                  {record.catatan}
                </p>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
