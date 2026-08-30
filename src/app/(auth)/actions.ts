"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOut() {
  const db = await createServerSupabaseClient();
  const { error } = await db.auth.signOut();
  if (error) console.error("signOut: supabase signOut failed", error);
  revalidatePath("/", "layout");
  redirect("/login");
}
