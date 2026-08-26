import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_RETENTION_DAYS = 90;
const BUCKET = "attendance-photos";

export async function uploadAttendancePhoto(
  db: SupabaseClient,
  employeeId: string,
  file: Blob,
  kind: "masuk" | "pulang",
  now: Date = new Date(),
): Promise<{ ok: true; path: string; expiresAt: string } | { ok: false; error: string }> {
  const path = `${employeeId}/${kind}-${now.getTime()}.jpg`;

  const { data, error } = await db.storage.from(BUCKET).upload(path, file, {
    contentType: "image/jpeg",
    upsert: false,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "failed to upload photo" };
  }

  const expiresAt = new Date(now.getTime() + PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return { ok: true, path: data.path, expiresAt };
}
