"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateLocationInput } from "@/lib/branches/validate-location";

type Result = { ok: true } | { ok: false; error: string };

export async function saveBranchLocation(
  branchId: string,
  formData: FormData,
): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const parsed = validateLocationInput({
    lat: formData.get("lat"),
    long: formData.get("long"),
    radius: formData.get("radius"),
  });
  if (!parsed.ok) return parsed;

  const { data: before, error: beforeErr } = await db
    .from("branches")
    .select("lat, long, radius_geofencing_meter")
    .eq("id", branchId)
    .single();
  if (beforeErr) console.error("saveBranchLocation: before-read failed", beforeErr);

  const after = {
    lat: parsed.value.lat,
    long: parsed.value.long,
    radius_geofencing_meter: parsed.value.radius,
  };

  const { error } = await db.from("branches").update(after).eq("id", branchId);
  if (error) {
    console.error("saveBranchLocation: update failed", error);
    return { ok: false, error: "Gagal menyimpan lokasi kantor." };
  }

  const service = createServiceRoleSupabaseClient();
  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: me.id,
    target_employee_id: null,
    aksi: "branch_location_update",
    detail: { branch_id: branchId, before: before ?? null, after },
  });
  if (auditErr) {
    console.error("saveBranchLocation: audit insert failed", auditErr);
  }

  revalidatePath("/pengaturan/lokasi");
  revalidatePath("/absen");
  return { ok: true };
}

export async function setBranchQr(
  branchId: string,
  formData: FormData,
): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const enabled = ["true", "on", "1"].includes(
    String(formData.get("enabled") ?? "").toLowerCase(),
  );

  // qr_secret / kiosk_key are not readable with the user-scoped client after
  // migration 0031's column grant — read them with the service-role client
  // (we are already behind the hr_admin/super_admin guard above).
  const service = createServiceRoleSupabaseClient();
  const { data: current } = await service
    .from("branches")
    .select("qr_secret, kiosk_key")
    .eq("id", branchId)
    .maybeSingle();

  const patch: Record<string, unknown> = { qr_enabled: enabled };
  if (enabled && !current?.qr_secret) {
    patch.qr_secret = randomBytes(32).toString("hex");
    patch.kiosk_key = randomBytes(18).toString("base64url");
  }

  const { data: updated, error } = await db
    .from("branches")
    .update(patch)
    .eq("id", branchId)
    .select("id");
  if (error) {
    console.error("setBranchQr: update failed", error);
    return { ok: false, error: "Gagal menyimpan pengaturan Absen QR." };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Cabang tidak ditemukan." };
  }

  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: me.id,
    target_employee_id: null,
    aksi: "branch_qr_update",
    detail: { branch_id: branchId, enabled },
  });
  if (auditErr) {
    console.error("setBranchQr: audit insert failed", auditErr);
  }

  revalidatePath("/pengaturan/lokasi");
  return { ok: true };
}

export async function resetKioskKey(branchId: string): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  // Rotate BOTH the kiosk URL segment and the token-minting secret: a leaked
  // qr_secret is otherwise unresettable (setBranchQr only mints it when null).
  const { data: updated, error } = await db
    .from("branches")
    .update({
      qr_secret: randomBytes(32).toString("hex"),
      kiosk_key: randomBytes(18).toString("base64url"),
    })
    .eq("id", branchId)
    .select("id");
  if (error) {
    console.error("resetKioskKey: update failed", error);
    return { ok: false, error: "Gagal mengganti link kiosk." };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Cabang tidak ditemukan." };
  }

  const service = createServiceRoleSupabaseClient();
  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: me.id,
    target_employee_id: null,
    aksi: "branch_kiosk_reset",
    detail: { branch_id: branchId },
  });
  if (auditErr) {
    console.error("resetKioskKey: audit insert failed", auditErr);
  }

  revalidatePath("/pengaturan/lokasi");
  return { ok: true };
}
