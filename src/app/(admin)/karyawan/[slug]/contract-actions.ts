"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { routePatterns } from "@/lib/routing/paths";
import { STATUS_KONTRAK_FOR, sortContracts, validateContractInput, type Contract } from "@/lib/employees/contracts";

type Result = { ok: true } | { ok: false; error: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hrOnly() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return { db, me: null };
  return { db, me };
}

/** Keeps employees.status_kontrak (shown on slips, used for interns) in step with the latest contract. */
async function syncStatusKontrak(db: Awaited<ReturnType<typeof createServerSupabaseClient>>, employeeId: string) {
  const { data } = await db
    .from("employee_contracts")
    .select("id, jenis, tanggal_mulai, tanggal_selesai, catatan")
    .eq("employee_id", employeeId);
  const latest = sortContracts((data ?? []) as Contract[])[0];
  if (!latest) return;
  const { error } = await db.from("employees").update({ status_kontrak: STATUS_KONTRAK_FOR[latest.jenis] }).eq("id", employeeId);
  if (error) console.error("syncStatusKontrak: update failed", error);
}

async function audit(actorId: string, employeeId: string, aksi: string, detail: Record<string, unknown>) {
  const { error } = await createServiceRoleSupabaseClient()
    .from("audit_logs")
    .insert({ actor_id: actorId, target_employee_id: employeeId, aksi, detail });
  if (error) console.error(`${aksi}: audit insert failed`, error);
}

export async function addContract(employeeId: string, formData: FormData): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  if (!UUID_RE.test(employeeId)) return { ok: false, error: "Karyawan tidak valid." };

  const parsed = validateContractInput({
    jenis: formData.get("jenis"),
    tanggalMulai: formData.get("tanggalMulai"),
    tanggalSelesai: formData.get("tanggalSelesai"),
    catatan: formData.get("catatan"),
  });
  if (!parsed.ok) return parsed;
  const v = parsed.value;

  const { error } = await db.from("employee_contracts").insert({
    employee_id: employeeId,
    jenis: v.jenis,
    tanggal_mulai: v.tanggalMulai,
    tanggal_selesai: v.tanggalSelesai,
    catatan: v.catatan,
    created_by: me.id,
  });
  if (error) {
    console.error("addContract: insert failed", error);
    return { ok: false, error: "Gagal menyimpan kontrak." };
  }
  await syncStatusKontrak(db, employeeId);
  await audit(me.id, employeeId, "contract_added", {
    jenis: v.jenis,
    tanggal_mulai: v.tanggalMulai,
    tanggal_selesai: v.tanggalSelesai,
  });
  revalidatePath(routePatterns.karyawan, "page");
  revalidatePath("/karyawan");
  return { ok: true };
}

/** For a contract entered by mistake. */
export async function deleteContract(employeeId: string, contractId: string): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  if (!UUID_RE.test(employeeId) || !UUID_RE.test(contractId)) return { ok: false, error: "Data tidak valid." };

  const { data, error } = await db
    .from("employee_contracts")
    .delete()
    .eq("id", contractId)
    .eq("employee_id", employeeId)
    .select("jenis, tanggal_mulai, tanggal_selesai");
  if (error || !data?.length) {
    if (error) console.error("deleteContract: delete failed", error);
    return { ok: false, error: "Gagal menghapus kontrak." };
  }
  await syncStatusKontrak(db, employeeId);
  await audit(me.id, employeeId, "contract_deleted", data[0]);
  revalidatePath(routePatterns.karyawan, "page");
  revalidatePath("/karyawan");
  return { ok: true };
}
