"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { recordConsent } from "@/lib/consent/consent";

export async function acceptConsent() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const result = await recordConsent(db, employee.id);
  if (!result.ok) {
    // Never reflect the raw error into the URL: it is English PostgREST text
    // that can disclose table/column/constraint names, and anything placed in
    // `?error=` is attacker-controllable and gets rendered in the app's own
    // error styling on an authenticated onboarding page. Log the detail
    // server-side and redirect with a fixed opaque code that page.tsx maps to a
    // hardcoded Indonesian message.
    console.error(`acceptConsent: recordConsent failed for ${employee.id}:`, result.error);
    redirect("/absen/consent?error=gagal");
  }

  redirect("/absen");
}
