import type { Role } from "@/lib/auth/route-access";

export type EmployeeFormInput = {
  nama: string;
  email: string;
  jabatan: string;
  statusKontrak: string;
  /** TK/0 … K/3 — PTKP status for PPh 21 (migration 0039). */
  statusPtkp: string;
  tanggalMulaiKerja: string;
  gajiPokok: number;
  role: Role;
  branchId: string;
  departmentId: string | null;
  atasanId: string | null;
  designatedApproverId: string | null;
};

const ROLES: Role[] = ["karyawan", "atasan", "hr_admin", "super_admin"];
export const PTKP_STATUSES = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

export function validateEmployeeInput(
  raw: Record<string, FormDataEntryValue | null>,
): { ok: true; value: EmployeeFormInput } | { ok: false; error: string } {
  const nama = str(raw.nama);
  const email = str(raw.email);
  const jabatan = str(raw.jabatan);
  const statusKontrak = str(raw.statusKontrak);
  const tanggalMulaiKerja = str(raw.tanggalMulaiKerja);
  const branchId = str(raw.branchId);
  const role = str(raw.role);
  const designatedApproverId = orNull(raw.designatedApproverId);

  if (!nama || !email || !jabatan || !tanggalMulaiKerja || !branchId) {
    return { ok: false, error: "Nama, email, jabatan, tanggal mulai kerja, dan cabang wajib diisi." };
  }
  if (!EMAIL.test(email)) {
    return { ok: false, error: "Format email tidak valid." };
  }
  if (!ISO_DATE.test(tanggalMulaiKerja)) {
    return { ok: false, error: "Tanggal mulai kerja harus format YYYY-MM-DD." };
  }
  if (!ROLES.includes(role as Role)) {
    return { ok: false, error: "Role tidak valid." };
  }
  const gajiPokok = Number(str(raw.gajiPokok) || "0");
  if (!Number.isFinite(gajiPokok) || gajiPokok < 0) {
    return { ok: false, error: "Gaji pokok harus angka >= 0." };
  }
  const statusPtkp = str(raw.statusPtkp) || "TK/0";
  if (!(PTKP_STATUSES as readonly string[]).includes(statusPtkp)) {
    return { ok: false, error: "Status PTKP tidak valid." };
  }
  if ((role === "hr_admin" || role === "super_admin") && !designatedApproverId) {
    return { ok: false, error: "Approver pengganti wajib untuk role HR Admin / Super Admin." };
  }

  return {
    ok: true,
    value: {
      nama, email, jabatan, statusKontrak: statusKontrak || "tetap", statusPtkp,
      tanggalMulaiKerja, gajiPokok, role: role as Role, branchId,
      departmentId: orNull(raw.departmentId),
      atasanId: orNull(raw.atasanId),
      designatedApproverId,
    },
  };
}
