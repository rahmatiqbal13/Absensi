// supabase/functions/purge-expired-photos/index.ts
// Deno Edge Function. Deletes attendance photos past their 90-day retention
// (foto_*_expires_at < now()) from the attendance-photos bucket and nulls the
// corresponding url + expires_at columns. Idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "attendance-photos";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response("forbidden", { status: 403 });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await db
    .from("attendances")
    .select("id, foto_masuk_url, foto_masuk_expires_at, foto_pulang_url, foto_pulang_expires_at")
    .or(`foto_masuk_expires_at.lt.${nowIso},foto_pulang_expires_at.lt.${nowIso}`)
    .limit(500);
  if (error) {
    console.error("purge-expired-photos: query failed", error);
    return new Response(JSON.stringify({ error: "query failed" }), { status: 500 });
  }

  const toRemove: string[] = [];
  const masukExpiredIds: string[] = [];
  const pulangExpiredIds: string[] = [];

  const stripPath = (v: string) => {
    const marker = `/${BUCKET}/`;
    const i = v.indexOf(marker);
    return i >= 0 ? v.slice(i + marker.length) : v;
  };

  for (const r of rows ?? []) {
    if (r.foto_masuk_expires_at && r.foto_masuk_expires_at < nowIso) {
      if (r.foto_masuk_url) toRemove.push(stripPath(r.foto_masuk_url));
      masukExpiredIds.push(r.id);
    }
    if (r.foto_pulang_expires_at && r.foto_pulang_expires_at < nowIso) {
      if (r.foto_pulang_url) toRemove.push(stripPath(r.foto_pulang_url));
      pulangExpiredIds.push(r.id);
    }
  }

  let deletedPhotos = 0;
  for (let i = 0; i < toRemove.length; i += 100) {
    const batch = toRemove.slice(i, i + 100);
    const { error: rmErr } = await db.storage.from(BUCKET).remove(batch);
    if (rmErr) console.error("purge-expired-photos: storage remove failed", rmErr);
    else deletedPhotos += batch.length;
  }

  if (masukExpiredIds.length) {
    await db.from("attendances").update({ foto_masuk_url: null, foto_masuk_expires_at: null }).in("id", masukExpiredIds);
  }
  if (pulangExpiredIds.length) {
    await db.from("attendances").update({ foto_pulang_url: null, foto_pulang_expires_at: null }).in("id", pulangExpiredIds);
  }

  return new Response(
    JSON.stringify({ deletedPhotos, updatedRows: masukExpiredIds.length + pulangExpiredIds.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
