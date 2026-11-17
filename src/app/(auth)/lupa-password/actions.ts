"use server";

import { redirect } from "next/navigation";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { createRecoveryLink, sendPasswordResetEmail } from "@/lib/auth/password-reset";
import { clientIp, RATE_LIMITED_MESSAGE, withinRateLimit } from "@/lib/security/rate-limit";

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

  const service = createServiceRoleSupabaseClient();
  // The per-account throttle lives in createRecoveryLink; this caps one IP
  // spraying many addresses (each would get an email).
  const allowed = await withinRateLimit(service, [
    { key: `reset:ip:${await clientIp()}`, max: 5, windowSeconds: 15 * 60 },
  ]);
  if (!allowed) redirect("/lupa-password?error=" + encodeURIComponent(RATE_LIMITED_MESSAGE));

  const result = await createRecoveryLink(service, { email }, { throttle: true });
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
