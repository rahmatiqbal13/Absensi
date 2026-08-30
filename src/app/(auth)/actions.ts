"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOut() {
  const db = await createServerSupabaseClient();
  await db.auth.signOut();
  redirect("/login");
}
