"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateImport, type ImportRow } from "@/lib/employees/import";
import { inviteEmployee } from "@/lib/employees/invite";

export type PreviewRow = Omit<ImportRow, "value"> & { ok: boolean };
export type ImportResult = { line: number; nama: string; email: string; ok: boolean; error?: string; setPasswordUrl?: string };

const MAX_BYTES = 512 * 1024;

async function load(text: string) {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return { ok: false as const, error: "Hanya HR yang dapat mengimpor karyawan." };
  if (text.length > MAX_BYTES) return { ok: false as const, error: "File terlalu besar (maks 512 KB)." };
  const service = createServiceRoleSupabaseClient();
  const [branches, departments, employees] = await Promise.all([
    service.from("branches").select("id, nama"),
    service.from("departments").select("id, nama, branch_id"),
    service.from("employees").select("id, email"),
  ]);
  if (branches.error || departments.error || employees.error) return { ok: false as const, error: "Gagal memuat data referensi." };
  const res = validateImport(text, {
    branches: branches.data as { id: string; nama: string }[],
    departments: departments.data as { id: string; nama: string; branch_id: string }[],
    employees: employees.data as { id: string; email: string }[],
  });
  return res.ok ? { ok: true as const, rows: res.rows, service } : res;
}

/** Checks the file and shows, per line, what would be imported or why not. */
export async function previewImport(text: string): Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; error: string }> {
  const res = await load(text);
  if (!res.ok) return res;
  return { ok: true, rows: res.rows.map(({ value, ...r }) => ({ ...r, ok: !!value })) };
}

/**
 * Creates every valid row (same invite flow as "Tambah Karyawan") and returns
 * each new person's set-password link. Invalid rows are skipped, not fatal.
 */
export async function runImport(text: string): Promise<{ ok: true; results: ImportResult[] } | { ok: false; error: string }> {
  const res = await load(text);
  if (!res.ok) return res;
  const results: ImportResult[] = [];
  for (const r of res.rows) {
    if (!r.value) {
      results.push({ line: r.line, nama: r.nama, email: r.email, ok: false, error: r.error });
      continue;
    }
    const v = r.value;
    // One at a time: each makes an auth user + employee row and must roll back alone.
    const out = await inviteEmployee(
      {
        nama: v.nama,
        email: v.email,
        jabatan: v.jabatan,
        statusKontrak: v.statusKontrak,
        statusPtkp: v.statusPtkp,
        tanggalMulaiKerja: v.tanggalMulaiKerja,
        gajiPokok: v.gajiPokok,
        role: v.role,
        branchId: v.branchId,
        departmentId: v.departmentId,
        atasanId: v.atasanId,
        designatedApproverId: v.designatedApproverId,
      },
      res.service,
    );
    results.push(
      out.ok
        ? { line: r.line, nama: v.nama, email: v.email, ok: true, setPasswordUrl: out.setPasswordUrl }
        : { line: r.line, nama: v.nama, email: v.email, ok: false, error: "Gagal membuat akun (email mungkin sudah dipakai)." },
    );
  }
  revalidatePath("/karyawan");
  return { ok: true, results };
}
