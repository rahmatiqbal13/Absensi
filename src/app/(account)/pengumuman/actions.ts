"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { preview, recipientsOf, validateAnnouncement } from "@/lib/announcements/announcements";
import { createNotifications } from "@/lib/notifications/create";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function hrOnly() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return { db, me: null };
  return { db, me };
}

/** Posts an announcement and notifies (bell + push) everyone it is for. */
export async function createAnnouncement(formData: FormData): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Hanya HR yang dapat membuat pengumuman." };
  const parsed = validateAnnouncement(Object.fromEntries(formData));
  if (!parsed.ok) return parsed;

  const { data, error } = await db
    .from("announcements")
    .insert({ ...parsed.value, created_by: me.id })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createAnnouncement: insert failed", error);
    return { ok: false, error: "Gagal menyimpan pengumuman." };
  }

  const service = createServiceRoleSupabaseClient();
  const { data: emps, error: empErr } = await service
    .from("employees")
    .select("id, branch_id, department_id")
    .eq("status", "aktif");
  if (empErr) console.error("createAnnouncement: recipients lookup failed", empErr);
  const ids = recipientsOf(parsed.value, (emps ?? []) as { id: string; branch_id: string; department_id: string | null }[], me.id);
  const res = await createNotifications(
    service,
    ids.map((employee_id) => ({
      employee_id,
      jenis: "pengumuman",
      kunci: data.id as string,
      judul: parsed.value.judul,
      isi: preview(parsed.value.isi),
      link: `/pengumuman#${data.id}`,
    })),
  );
  revalidatePath("/pengumuman");
  return { ok: true, message: `Pengumuman terkirim ke ${res.ok ? res.created : 0} orang.` };
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  const { db, me } = await hrOnly();
  if (!me) return { ok: false, error: "Tidak diizinkan." };
  const { error } = await db.from("announcements").delete().eq("id", id);
  if (error) {
    console.error("deleteAnnouncement: delete failed", error);
    return { ok: false, error: "Gagal menghapus pengumuman." };
  }
  revalidatePath("/pengumuman");
  return { ok: true };
}
