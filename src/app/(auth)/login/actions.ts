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
    console.error("login: signInWithPassword failed", error);
    redirect("/login?error=Email%20atau%20kata%20sandi%20salah.");
  }

  const { data: userData } = await db.auth.getUser();
  if (userData.user) {
    const { data: emp } = await db
      .from("employees")
      .select("status")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (emp && emp.status !== "aktif") {
      await db.auth.signOut();
      redirect("/login?reason=nonaktif");
    }
  }

  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login?error=Akun%20tidak%20terhubung%20ke%20data%20karyawan");
  }

  redirect("/absen");
}
