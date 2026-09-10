"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateBranchInput } from "@/lib/branches/validate-branch";

type Result = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };

async function assertHrAdmin() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { db, me: null, denied: { ok: false as const, error: "Tidak diizinkan." } };
  }
  return { db, me, denied: null };
}

function revalidateBranchPages() {
  for (const p of [
    "/pengaturan/cabang",
    "/pengaturan/lokasi",
    "/pengaturan/jadwal",
    "/pengaturan/departemen",
  ]) {
    revalidatePath(p);
  }
}

async function writeAudit(actorId: string, aksi: string, detail: Record<string, unknown>) {
  const service = createServiceRoleSupabaseClient();
  const { error } = await service
    .from("audit_logs")
    .insert({ actor_id: actorId, target_employee_id: null, aksi, detail });
  if (error) console.error(`writeAudit(${aksi}) failed`, error);
}

export async function createBranch(formData: FormData): Promise<CreateResult> {
  const { db, me, denied } = await assertHrAdmin();
  if (denied) return denied;

  const parsed = validateBranchInput({ nama: formData.get("nama"), alamat: formData.get("alamat") });
  if (!parsed.ok) return parsed;

  const { data, error } = await db
    .from("branches")
    .insert({
      nama: parsed.value.nama,
      alamat: parsed.value.alamat,
      lat: 0,
      long: 0,
      radius_geofencing_meter: 100,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createBranch: insert failed", error);
    return { ok: false, error: "Gagal menambah cabang." };
  }

  await writeAudit(me.id, "branch_created", {
    branch_id: data.id,
    nama: parsed.value.nama,
    alamat: parsed.value.alamat,
  });
  revalidateBranchPages();
  return { ok: true, id: data.id };
}

export async function updateBranch(branchId: string, formData: FormData): Promise<Result> {
  const { db, me, denied } = await assertHrAdmin();
  if (denied) return denied;
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const parsed = validateBranchInput({ nama: formData.get("nama"), alamat: formData.get("alamat") });
  if (!parsed.ok) return parsed;

  const { data: before, error: beforeErr } = await db
    .from("branches")
    .select("nama, alamat")
    .eq("id", branchId)
    .single();
  if (beforeErr) console.error("updateBranch: before-read failed", beforeErr);

  const after = { nama: parsed.value.nama, alamat: parsed.value.alamat };
  const { data, error } = await db
    .from("branches")
    .update(after)
    .eq("id", branchId)
    .select("id");
  if (error) {
    console.error("updateBranch: update failed", error);
    return { ok: false, error: "Gagal menyimpan perubahan cabang." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menyimpan perubahan cabang atau Anda tidak berhak." };
  }

  await writeAudit(me.id, "branch_updated", { branch_id: branchId, before: before ?? null, after });
  revalidateBranchPages();
  return { ok: true };
}

export async function deleteBranch(branchId: string): Promise<Result> {
  const { db, me, denied } = await assertHrAdmin();
  if (denied) return denied;
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const [emp, dept, pay] = await Promise.all([
    db.from("employees").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
    db.from("departments").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
    db.from("payroll_periods").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
  ]);
  if (emp.error || dept.error || pay.error) {
    console.error("deleteBranch: dependency count failed", emp.error ?? dept.error ?? pay.error);
    return { ok: false, error: "Gagal memeriksa keterkaitan cabang." };
  }
  const blockers: string[] = [];
  if ((emp.count ?? 0) > 0) blockers.push(`${emp.count} karyawan`);
  if ((dept.count ?? 0) > 0) blockers.push(`${dept.count} departemen`);
  if ((pay.count ?? 0) > 0) blockers.push(`${pay.count} periode payroll`);
  if (blockers.length > 0) {
    return {
      ok: false,
      error: `Cabang masih dipakai: ${blockers.join(", ")}. Pindahkan atau hapus dulu.`,
    };
  }

  // Audit before-image via the service-role client (migration 0031's column
  // grant blocks `qr_secret`/`kiosk_key` for the user-scoped client) — but only
  // the non-secret identity columns: the deleted branch's QR secret has no
  // forensic value and audit_logs is readable by every admin.
  const { data: branchRow, error: branchRowErr } = await createServiceRoleSupabaseClient()
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter, qr_enabled")
    .eq("id", branchId)
    .single();
  if (branchRowErr) console.error("deleteBranch: before-read failed", branchRowErr);

  const { data, error } = await db.from("branches").delete().eq("id", branchId).select("id");
  if (error) {
    console.error("deleteBranch: delete failed", error);
    return { ok: false, error: "Gagal menghapus cabang." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menghapus cabang atau Anda tidak berhak." };
  }

  await writeAudit(me.id, "branch_deleted", { branch_id: branchId, before: branchRow ?? null });
  revalidateBranchPages();
  return { ok: true };
}
