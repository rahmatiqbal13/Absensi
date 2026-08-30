import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
const SIGN_TTL_SECONDS = 3600;

export function profilePhotoPath(employeeId: string): string {
  return `${employeeId}/avatar.jpg`;
}

export async function signProfilePhotoUrl(
  db: SupabaseClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await db.storage
      .from(PROFILE_PHOTO_BUCKET)
      .createSignedUrl(path, SIGN_TTL_SECONDS);
    if (error || !data) {
      if (error) console.error("signProfilePhotoUrl: failed", error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error("signProfilePhotoUrl: unexpected", err);
    return null;
  }
}

export async function signProfilePhotoUrls(
  db: SupabaseClient,
  paths: (string | null)[],
): Promise<(string | null)[]> {
  const real = paths.filter((p): p is string => Boolean(p));
  if (real.length === 0) return paths.map(() => null);
  try {
    const { data, error } = await db.storage
      .from(PROFILE_PHOTO_BUCKET)
      .createSignedUrls(real, SIGN_TTL_SECONDS);
    if (error || !data) {
      if (error) console.error("signProfilePhotoUrls: failed", error);
      return paths.map(() => null);
    }
    const byPath = new Map(
      data.map((d) => [d.path, d.error ? null : d.signedUrl] as const),
    );
    return paths.map((p) => (p ? byPath.get(p) ?? null : null));
  } catch (err) {
    console.error("signProfilePhotoUrls: unexpected", err);
    return paths.map(() => null);
  }
}
