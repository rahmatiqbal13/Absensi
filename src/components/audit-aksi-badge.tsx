import { Badge } from "@/components/ui/badge";

type BadgeVariant = "success" | "info" | "danger" | "neutral";

const CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  employee_created: { label: "Karyawan Dibuat", variant: "success" },
  employee_updated: { label: "Karyawan Diubah", variant: "info" },
  employee_deactivated: { label: "Karyawan Dinonaktifkan", variant: "danger" },
  employee_reactivated: { label: "Karyawan Diaktifkan", variant: "success" },
  employee_deleted: { label: "Karyawan Dihapus", variant: "danger" },
  attendance_correction_approved: { label: "Koreksi Absensi Disetujui", variant: "success" },
  attendance_correction_rejected: { label: "Koreksi Absensi Ditolak", variant: "danger" },
  payroll_paid: { label: "Payroll Dibayar", variant: "success" },
  payroll_paid_undone: { label: "Status Dibayar Dibatalkan", variant: "neutral" },
  password_reset_link: { label: "Link Reset Sandi Dibuat", variant: "info" },
  leave_approved: { label: "Cuti Disetujui", variant: "success" },
  leave_rejected: { label: "Cuti Ditolak", variant: "danger" },
  leave_cancelled: { label: "Cuti Dibatalkan", variant: "neutral" },
  branch_location_update: { label: "Lokasi Kantor Diubah", variant: "info" },
  mesin_absensi_import: { label: "Impor Mesin Absensi", variant: "info" },
  employee_pin_mesin_set: { label: "PIN Mesin Diatur", variant: "info" },
  branch_created: { label: "Cabang Dibuat", variant: "success" },
  branch_updated: { label: "Cabang Diubah", variant: "info" },
  branch_deleted: { label: "Cabang Dihapus", variant: "danger" },
  branch_qr_update: { label: "Absen QR Diubah", variant: "info" },
  branch_kiosk_reset: { label: "Link & Kode Kiosk Diganti", variant: "info" },
  contract_added: { label: "Kontrak Ditambahkan", variant: "success" },
  contract_deleted: { label: "Kontrak Dihapus", variant: "danger" },
  work_request_approved: { label: "Pengajuan Disetujui", variant: "success" },
  work_request_rejected: { label: "Pengajuan Ditolak", variant: "danger" },
  birth_date_corrected: { label: "Tanggal Lahir Dikoreksi", variant: "info" },
  consent_withdrawn: { label: "Persetujuan Data Ditarik", variant: "neutral" },
  attendance_evidence_viewed: { label: "Foto & Lokasi Absen Dibuka", variant: "neutral" },
};

export function AuditAksiBadge({ aksi }: { aksi: string }) {
  const c = CONFIG[aksi] ?? { label: aksi, variant: "neutral" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
