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
    redirect(`/absen/consent?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/absen");
}
