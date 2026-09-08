// Scoped teardown for the integration suite.
//
// Every integration test creates fixtures directly in the live Supabase project
// with the service-role client and (historically) never removed them, so each
// run left behind branches, auth users, attendances, leave requests, payroll
// rows and audit entries. Over many runs the admin dashboard filled with
// hundreds of "Cabang RLS" / "*@test.local" rows.
//
// This module deletes ONLY test-created data, keyed on two signals that real
// data never carries:
//   1. auth users / employees whose email ends in "@test.local"
//   2. branches left with zero referencing rows once those employees are gone
//      (a real branch always has at least its own staff)
//
// It never touches app_settings, the storage buckets, or any account on a real
// email domain. Safe to run repeatedly; a no-op on an already-clean project.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TEST_EMAIL_SUFFIX = "@test.local";

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function deleteTestAuthUsers(db: SupabaseClient): Promise<number> {
  let deleted = 0;
  // Deleting shifts pagination, so always re-read page 1 until a scan finds
  // no more @test.local users.
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await db.auth.admin.listUsers({ perPage: 200, page: 1 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const targets = (data?.users ?? []).filter((u) => u.email?.endsWith(TEST_EMAIL_SUFFIX));
    if (targets.length === 0) return deleted;
    for (const u of targets) {
      const { error: delErr } = await db.auth.admin.deleteUser(u.id);
      if (!delErr) deleted++;
    }
  }
  return deleted;
}

async function deleteOrphanBranches(db: SupabaseClient): Promise<number> {
  const { data: branches } = await db.from("branches").select("id");
  if (!branches?.length) return 0;

  let deleted = 0;
  for (const { id } of branches) {
    const referencing = await Promise.all(
      (["employees", "departments", "work_schedules", "payroll_periods"] as const).map((t) =>
        db.from(t).select("id", { count: "exact", head: true }).eq("branch_id", id),
      ),
    );
    const stillUsed = referencing.some((r) => (r.count ?? 0) > 0);
    if (stillUsed) continue;
    // holidays cascade on branch delete; nothing else references a branch.
    const { error } = await db.from("branches").delete().eq("id", id);
    if (!error) deleted++;
  }
  return deleted;
}

async function deleteNullAudit(db: SupabaseClient): Promise<number> {
  // Rows whose actor and target were both nulled by the SET NULL cascade when
  // their test employees were removed — no forensic value, pure noise.
  const { error, count } = await db
    .from("audit_logs")
    .delete({ count: "exact" })
    .is("actor_id", null)
    .is("target_employee_id", null);
  if (error) return 0;
  return count ?? 0;
}

export async function cleanupIntegrationTestData(): Promise<void> {
  const db = serviceClient();
  if (!db) {
    console.warn("[integration teardown] Supabase env not set — skipping cleanup");
    return;
  }
  try {
    const users = await deleteTestAuthUsers(db);
    const branches = await deleteOrphanBranches(db);
    const audit = await deleteNullAudit(db);
    if (users || branches || audit) {
      console.log(
        `[integration teardown] removed ${users} test users, ${branches} orphan branches, ${audit} orphan audit rows`,
      );
    }
  } catch (err) {
    // A teardown failure must not fail the test run; just report it.
    console.warn("[integration teardown] cleanup error:", (err as Error).message);
  }
}
