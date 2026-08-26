import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
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
    return <p className="p-4 text-sm text-neutral-500">Belum ada riwayat absensi.</p>;
  }

  return (
    <ul className="divide-y">
      {records.map((record) => (
        <li key={record.tanggal} className="flex flex-col gap-1 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{formatDate(record.tanggal)}</span>
            <AttendanceStatusBadge status={record.status} />
          </div>
          <span className="text-sm text-neutral-600">
            {formatTime(record.jamMasuk)} – {formatTime(record.jamPulang)}
          </span>
          {record.catatan && <span className="text-sm text-neutral-500">{record.catatan}</span>}
        </li>
      ))}
    </ul>
  );
}
