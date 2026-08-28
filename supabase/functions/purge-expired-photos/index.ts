// supabase/functions/purge-expired-photos/index.ts
// Deno Edge Function. Deletes attendance photos past their 90-day retention
// (foto_*_expires_at < now()) from the attendance-photos bucket and nulls the
// corresponding url + expires_at columns. Idempotent: a row whose storage
// object failed to remove is left un-nulled, so it still matches the filter on
// the next run and is retried automatically. If either DB null-out errors the
// function returns 500 and nothing is reported as done.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "attendance-photos";

Deno.serve(async (req) => {
  // Auth is a dedicated shared secret (set via `supabase secrets set`), NOT the
  // service-role key: a project with both a legacy service_role JWT and a new
  // sb_secret_* key has an ambiguous SUPABASE_SERVICE_ROLE_KEY, so an exact
  // Bearer match against it is unreliable. The cron in migration 0025 sends the
  // same secret from Vault.
  const auth = req.headers.get("Authorization");
  const sharedSecret = Deno.env.get("PURGE_SHARED_SECRET");
  if (!sharedSecret || auth !== `Bearer ${sharedSecret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

  const stripPath = (v: string) => {
    const marker = `/${BUCKET}/`;
    const i = v.indexOf(marker);
    return i >= 0 ? v.slice(i + marker.length) : v;
  };

  // Keep id -> path pairs so a failed storage removal can be mapped back to the
  // row it belongs to and that row skipped for null-out (retried next run).
  const masukTargets: { id: string; path: string | null }[] = [];
  const pulangTargets: { id: string; path: string | null }[] = [];
  const toRemove: string[] = [];

  for (const r of rows ?? []) {
    if (r.foto_masuk_expires_at && r.foto_masuk_expires_at < nowIso) {
      const path = r.foto_masuk_url ? stripPath(r.foto_masuk_url) : null;
      if (path) toRemove.push(path);
      masukTargets.push({ id: r.id, path });
    }
    if (r.foto_pulang_expires_at && r.foto_pulang_expires_at < nowIso) {
      const path = r.foto_pulang_url ? stripPath(r.foto_pulang_url) : null;
      if (path) toRemove.push(path);
      pulangTargets.push({ id: r.id, path });
    }
  }

  const failedPaths = new Set<string>();
  let deletedPhotos = 0;
  for (let i = 0; i < toRemove.length; i += 100) {
    const batch = toRemove.slice(i, i + 100);
    const { data: removed, error: rmErr } = await db.storage.from(BUCKET).remove(batch);
    if (rmErr) {
      console.error("purge-expired-photos: storage remove failed", rmErr);
      for (const p of batch) failedPaths.add(p);
    } else {
      deletedPhotos += removed?.length ?? 0;
    }
  }

  // A row with no path (null url) has nothing to orphan, so null it regardless.
  const masukOkIds = masukTargets.filter((t) => !t.path || !failedPaths.has(t.path)).map((t) => t.id);
  const pulangOkIds = pulangTargets.filter((t) => !t.path || !failedPaths.has(t.path)).map((t) => t.id);

  if (masukOkIds.length) {
    const { error: updErr } = await db
      .from("attendances")
      .update({ foto_masuk_url: null, foto_masuk_expires_at: null })
      .in("id", masukOkIds);
    if (updErr) {
      console.error("purge-expired-photos: masuk null-out failed", updErr);
      return new Response(JSON.stringify({ error: "update failed" }), { status: 500 });
    }
  }
  if (pulangOkIds.length) {
    const { error: updErr } = await db
      .from("attendances")
      .update({ foto_pulang_url: null, foto_pulang_expires_at: null })
      .in("id", pulangOkIds);
    if (updErr) {
      console.error("purge-expired-photos: pulang null-out failed", updErr);
      return new Response(JSON.stringify({ error: "update failed" }), { status: 500 });
    }
  }

  return new Response(
    JSON.stringify({ deletedPhotos, updatedRows: masukOkIds.length + pulangOkIds.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
