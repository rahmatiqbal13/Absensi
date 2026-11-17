"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { clientIp, RATE_LIMITED_MESSAGE, withinRateLimit } from "@/lib/security/rate-limit";

const WINDOW = 15 * 60;

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // Per IP (a guessing run across accounts) and per email (one account from
  // many IPs). Counted before Supabase Auth sees the attempt.
  const allowed = await withinRateLimit(createServiceRoleSupabaseClient(), [
    { key: `login:ip:${await clientIp()}`, max: 20, windowSeconds: WINDOW },
    { key: `login:email:${String(email ?? "").trim().toLowerCase()}`, max: 10, windowSeconds: WINDOW },
  ]);
  if (!allowed) redirect("/login?error=" + encodeURIComponent(RATE_LIMITED_MESSAGE));

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
