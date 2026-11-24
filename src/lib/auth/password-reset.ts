import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/app-url";
import { sendEmail, escapeHtml, type EmailResult } from "@/lib/email/send";

/** One reset email per account per minute: blunts email-bombing via the public form. */
export const RESET_THROTTLE_MS = 60_000;

export type RecoveryLinkResult =
  | { ok: true; url: string; email: string; nama: string }
  | { ok: false; reason: "not-found" | "inactive" | "no-email" | "throttled" | "error" };

type EmployeeRow = { id: string; nama: string; email: string | null; status: string };

/**
 * Builds a one-time password-reset link on our own domain
 * (`/set-password?t=<hashed_token>&type=recovery`), same shape as the invite
 * link: the token is only redeemed by JS on the page, so link previews in chat
 * apps can't burn it.
 *
 * `db` must be the service-role client. Look the employee up by `employeeId`
 * (HR flow) or by `email` (public "lupa kata sandi" flow — case-insensitive).
 */
export async function createRecoveryLink(
  db: SupabaseClient,
  who: { employeeId: string } | { email: string },
  opts: { throttle: boolean },
): Promise<RecoveryLinkResult> {
  const base = db.from("employees").select("id, nama, email, status");
  const { data, error } =
    "employeeId" in who
      ? await base.eq("id", who.employeeId).maybeSingle()
      : // ilike for case-insensitivity; escape its wildcards so input matches literally.
        await base.ilike("email", who.email.trim().replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  if (error) {
    console.error("createRecoveryLink: employee lookup failed", error);
    return { ok: false, reason: "error" };
  }
  const employee = data as EmployeeRow | null;
  if (!employee) return { ok: false, reason: "not-found" };
  if (employee.status !== "aktif") return { ok: false, reason: "inactive" };
  // Added without email (machine-only): no login address to reset yet.
  if (!employee.email) return { ok: false, reason: "no-email" };

  if (opts.throttle) {
    const { data: authUser, error: authErr } = await db.auth.admin.getUserById(employee.id);
    if (authErr) {
      console.error("createRecoveryLink: auth user lookup failed", authErr);
      return { ok: false, reason: "error" };
    }
    const sentAt = authUser.user?.recovery_sent_at;
    if (sentAt && Date.now() - new Date(sentAt).getTime() < RESET_THROTTLE_MS) {
      return { ok: false, reason: "throttled" };
    }
  }

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: "recovery",
    email: employee.email,
    options: { redirectTo: `${appUrl()}/set-password` },
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.error("createRecoveryLink: generateLink failed", linkErr);
    return { ok: false, reason: "error" };
  }

  return {
    ok: true,
    url: `${appUrl()}/set-password?t=${encodeURIComponent(tokenHash)}&type=recovery`,
    email: employee.email,
    nama: employee.nama,
  };
}

export function sendPasswordResetEmail(to: { email: string; nama: string }, url: string): Promise<EmailResult> {
  return sendEmail({
    to: to.email,
    subject: "Atur ulang kata sandi Anda",
    text:
      `Halo ${to.nama},\n\n` +
      `Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda.\n` +
      `Buka link berikut untuk membuat kata sandi baru (sekali pakai):\n\n${url}\n\n` +
      `Jika Anda tidak meminta ini, abaikan email ini — kata sandi Anda tidak berubah.\n`,
    html:
      `<p>Halo ${escapeHtml(to.nama)},</p>` +
      `<p>Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda.</p>` +
      `<p><a href="${escapeHtml(url)}">Buat kata sandi baru</a> (link sekali pakai)</p>` +
      `<p>Jika Anda tidak meminta ini, abaikan email ini — kata sandi Anda tidak berubah.</p>`,
  });
}
