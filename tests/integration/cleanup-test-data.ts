// Scoped teardown for the integration suite.
//
// Every integration test creates fixtures directly in the live Supabase project
// with the service-role client and (historically) never removed them, so each
// run left behind branches, auth users, attendances, leave requests, payroll
// rows and audit entries. Over many runs the admin dashboard filled with
// hundreds of "Cabang RLS" / "*@test.local" rows.
//
// This module deletes ONLY test-created data, keyed on signals real data never
// carries:
//   1. auth users / employees whose email ends in "@test.local", and the audit
//      rows that name them (removed BEFORE the users, while still linkable)
//   2. branches at the fixture coordinates every test uses (lat -6.2/-6.3,
//      long 106.8/106.9) that have no employees left — plus their departments,
//      schedules and payroll periods. A real branch the admin just created but
//      hasn't staffed yet is NOT touched (it has real coordinates).
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

async function deleteTestAudit(db: SupabaseClient): Promise<number> {
  const { data: emps } = await db.from("employees").select("id").like("email", `%${TEST_EMAIL_SUFFIX}`);
  const ids = (emps ?? []).map((e) => e.id as string);
  if (!ids.length) return 0;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).join(",");
    const { count } = await db
      .from("audit_logs")
      .delete({ count: "exact" })
      .or(`actor_id.in.(${chunk}),target_employee_id.in.(${chunk})`);
    deleted += count ?? 0;
  }
  return deleted;
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

// Fixture branches are always created at these coordinates (see the tests).
const isFixtureLocation = (lat: number, long: number) =>
  lat >= -6.31 && lat <= -6.19 && long >= 106.79 && long <= 106.91;

async function deleteTestBranches(db: SupabaseClient): Promise<number> {
  const { data: branches } = await db.from("branches").select("id, lat, long");
  let deleted = 0;
  for (const b of branches ?? []) {
    if (!isFixtureLocation(Number(b.lat), Number(b.long))) continue;
    const { count: staff } = await db
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", b.id);
    if ((staff ?? 0) > 0) continue;
    // payslips cascade from payroll_periods; work_schedules and holidays cascade
    // from departments / branches.
    await db.from("payroll_periods").delete().eq("branch_id", b.id);
    await db.from("departments").delete().eq("branch_id", b.id);
    const { error } = await db.from("branches").delete().eq("id", b.id);
    if (!error) deleted++;
  }
  return deleted;
}

export async function cleanupIntegrationTestData(): Promise<void> {
  const db = serviceClient();
  if (!db) {
    console.warn("[integration teardown] Supabase env not set — skipping cleanup");
    return;
  }
  try {
    const audit = await deleteTestAudit(db);
    const users = await deleteTestAuthUsers(db);
    const branches = await deleteTestBranches(db);
    if (users || branches || audit) {
      console.log(
        `[integration teardown] removed ${users} test users, ${branches} test branches, ${audit} test audit rows`,
      );
    }
  } catch (err) {
    // A teardown failure must not fail the test run; just report it.
    console.warn("[integration teardown] cleanup error:", (err as Error).message);
  }
}
