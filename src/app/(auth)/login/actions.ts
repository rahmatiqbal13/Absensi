"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const db = await createServerSupabaseClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login?error=Akun%20tidak%20terhubung%20ke%20data%20karyawan");
  }

  redirect("/absen");
}
