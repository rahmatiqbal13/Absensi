const CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  employee_created: { label: "Karyawan Dibuat", bg: "bg-green-50", fg: "text-green-700" },
  employee_updated: { label: "Karyawan Diubah", bg: "bg-blue-50", fg: "text-blue-700" },
  employee_deactivated: { label: "Karyawan Dinonaktifkan", bg: "bg-red-50", fg: "text-red-700" },
  employee_reactivated: { label: "Karyawan Diaktifkan", bg: "bg-green-50", fg: "text-green-700" },
  employee_deleted: { label: "Karyawan Dihapus", bg: "bg-red-50", fg: "text-red-700" },
  leave_approved: { label: "Cuti Disetujui", bg: "bg-green-50", fg: "text-green-700" },
  leave_rejected: { label: "Cuti Ditolak", bg: "bg-red-50", fg: "text-red-700" },
};

export function AuditAksiBadge({ aksi }: { aksi: string }) {
  const c = CONFIG[aksi] ?? { label: aksi, bg: "bg-neutral-100", fg: "text-neutral-700" };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${c.bg} ${c.fg}`}
    >
      {c.label}
    </span>
  );
}
