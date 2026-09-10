import { Badge } from "@/components/ui/badge";

type BadgeVariant = "success" | "info" | "destructive" | "neutral";

const CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  employee_created: { label: "Karyawan Dibuat", variant: "success" },
  employee_updated: { label: "Karyawan Diubah", variant: "info" },
  employee_deactivated: { label: "Karyawan Dinonaktifkan", variant: "destructive" },
  employee_reactivated: { label: "Karyawan Diaktifkan", variant: "success" },
  employee_deleted: { label: "Karyawan Dihapus", variant: "destructive" },
  leave_approved: { label: "Cuti Disetujui", variant: "success" },
  leave_rejected: { label: "Cuti Ditolak", variant: "destructive" },
  branch_location_update: { label: "Lokasi Kantor Diubah", variant: "info" },
  branch_created: { label: "Cabang Dibuat", variant: "success" },
  branch_updated: { label: "Cabang Diubah", variant: "info" },
  branch_deleted: { label: "Cabang Dihapus", variant: "destructive" },
  branch_qr_update: { label: "Absen QR Diubah", variant: "info" },
  branch_kiosk_reset: { label: "Link & Kode Kiosk Diganti", variant: "info" },
};

export function AuditAksiBadge({ aksi }: { aksi: string }) {
  const c = CONFIG[aksi] ?? { label: aksi, variant: "neutral" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
