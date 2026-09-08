"use server";

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
