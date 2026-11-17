import type { SupabaseClient } from "@supabase/supabase-js";

/** Leave attachments (surat dokter etc.) — private bucket, migration 0038. */
export const LEAVE_ATTACHMENT_BUCKET = "leave-attachments";

/**
 * Short-lived read links for attachment paths. Call only with the service-role
 * client and only after checking the viewer may see those requests.
 */
export async function signLeaveAttachments(
  service: SupabaseClient,
  paths: (string | null | undefined)[],
  expiresInSec = 600,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await service.storage
    .from(LEAVE_ATTACHMENT_BUCKET)
    .createSignedUrls(unique, expiresInSec);
  if (error) {
    console.error("signLeaveAttachments failed", error);
    return out;
  }
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}
