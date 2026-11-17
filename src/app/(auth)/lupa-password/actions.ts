"use server";

import { redirect } from "next/navigation";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { createRecoveryLink, sendPasswordResetEmail } from "@/lib/auth/password-reset";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public "lupa kata sandi" form. Always lands on the same confirmation whether
 * or not the email belongs to an (active) employee, so the form can't be used
 * to discover which addresses have accounts.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email)) {
    redirect("/lupa-password?error=" + encodeURIComponent("Format email tidak valid."));
  }

  const result = await createRecoveryLink(createServiceRoleSupabaseClient(), { email }, { throttle: true });
  if (result.ok) {
    const sent = await sendPasswordResetEmail(result, result.url).catch((e) => {
      console.error("requestPasswordReset: email send threw", e);
      return null;
    });
    if (sent && !sent.sent) console.warn("requestPasswordReset: email not sent", sent.reason);
  } else if (result.reason === "error") {
    console.error("requestPasswordReset: could not create recovery link");
  }

  redirect("/lupa-password?terkirim=1");
}
