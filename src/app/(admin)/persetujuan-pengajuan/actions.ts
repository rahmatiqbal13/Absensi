"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { decideWorkRequest } from "@/lib/requests/service";

type Result = { ok: true } | { ok: false; error: string };

export async function decideRequest(id: string, approve: boolean, formData: FormData): Promise<Result> {
  const me = await getCurrentEmployee(await createServerSupabaseClient());
  if (!me || me.role === "karyawan") return { ok: false, error: "Tidak diizinkan." };
  const catatan = String(formData.get("catatan") ?? "").trim().slice(0, 500) || null;
  const r = await decideWorkRequest(createServiceRoleSupabaseClient(), me, id, approve, catatan);
  if (r.ok) {
    revalidatePath("/persetujuan-pengajuan");
    revalidatePath("/dashboard");
  }
  return r;
}
