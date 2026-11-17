/**
 * Minimal transactional email via Resend's HTTP API (no SDK dependency).
 * Needs RESEND_API_KEY and EMAIL_FROM (e.g. "Absensi <absensi@domain-anda.id>",
 * a sender on a domain verified in Resend). When either is missing the email is
 * skipped and logged — the app keeps working without mail configured.
 */
export type EmailResult = { sent: true; id?: string } | { sent: false; reason: string };

export async function sendEmail(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info("sendEmail: RESEND_API_KEY / EMAIL_FROM not set, skipping", msg.subject);
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("sendEmail: Resend rejected", res.status, body.slice(0, 300));
      return { sent: false, reason: `http-${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: json.id };
  } catch (e) {
    console.error("sendEmail: request failed", e);
    return { sent: false, reason: "network" };
  }
}

/** Escape text for safe interpolation into email HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
