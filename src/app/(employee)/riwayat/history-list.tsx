import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";

export type AttendanceRecord = {
  tanggal: string;
  jamMasuk: string | null;
  jamPulang: string | null;
  status: AttendanceStatus;
  catatan: string | null;
};

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
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
