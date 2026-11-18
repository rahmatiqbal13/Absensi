"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateWorkRequest } from "@/lib/requests/work-requests";
import { cancelWorkRequest, submitWorkRequest } from "@/lib/requests/service";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";

type Result = { ok: true } | { ok: false; error: string };

export async function submitRequest(formData: FormData): Promise<Result> {
  const me = await getCurrentEmployee(await createServerSupabaseClient());
  if (!me) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const parsed = validateWorkRequest(Object.fromEntries(formData), toJakartaDateOnly(new Date()));
  if (!parsed.ok) return parsed;
  const r = await submitWorkRequest(createServiceRoleSupabaseClient(), me, parsed.value);
  if (r.ok) revalidatePath("/pengajuan");
  return r;
}

export async function cancelRequest(id: string): Promise<Result> {
  const me = await getCurrentEmployee(await createServerSupabaseClient());
  if (!me) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const r = await cancelWorkRequest(createServiceRoleSupabaseClient(), me, id);
  if (r.ok) revalidatePath("/pengajuan");
  return r;
}
