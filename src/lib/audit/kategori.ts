/** Coarse grouping of audit_logs.aksi for the timeline tabs. */
export const AUDIT_KATEGORI = [
  { value: "buat", label: "Buat" },
  { value: "ubah", label: "Ubah" },
  { value: "hapus", label: "Hapus" },
  { value: "setujui", label: "Setujui" },
  { value: "tolak", label: "Tolak" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export type AuditKategori = (typeof AUDIT_KATEGORI)[number]["value"];

const KATEGORI_AKSI: Record<Exclude<AuditKategori, "lainnya">, string[]> = {
  buat: ["employee_created", "branch_created", "contract_added", "password_reset_link"],
  ubah: [
    "employee_updated",
    "employee_reactivated",
    "branch_updated",
    "branch_location_update",
    "branch_qr_update",
    "branch_kiosk_reset",
    "birth_date_corrected",
    "payroll_paid",
    "payroll_paid_undone",
    "mesin_absensi_import",
    "employee_pin_mesin_set",
  ],
  hapus: ["employee_deactivated", "employee_deleted", "branch_deleted", "contract_deleted"],
  setujui: ["leave_approved", "attendance_correction_approved", "work_request_approved"],
  tolak: ["leave_rejected", "attendance_correction_rejected", "work_request_rejected"],
};

export function kategoriOf(aksi: string): AuditKategori {
  for (const [k, list] of Object.entries(KATEGORI_AKSI)) {
    if (list.includes(aksi)) return k as AuditKategori;
  }
  return "lainnya";
}

export function isAuditKategori(v: string | undefined): v is AuditKategori {
  return AUDIT_KATEGORI.some((k) => k.value === v);
}

/** Aksi values in a category; `lainnya` has no list (filter it by exclusion). */
export function aksiIn(k: Exclude<AuditKategori, "lainnya">): string[] {
  return KATEGORI_AKSI[k];
}

export function allCategorisedAksi(): string[] {
  return Object.values(KATEGORI_AKSI).flat();
}
