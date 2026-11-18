/**
 * Minimal transactional email via Resend's HTTP API (no SDK dependency).
 * Needs RESEND_API_KEY and EMAIL_FROM (e.g. "tapabsen <noreply@domain-anda.id>",
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

export type EmailMessage = { to: string; subject: string; html: string; text: string };

const BATCH_SIZE = 100; // Resend's per-request maximum for /emails/batch

/**
 * Many emails in as few requests as possible (Resend's batch endpoint, 100 per
 * call) — one request per employee would hit the 2 requests/second limit of
 * the free plan. Returns how many were accepted; failures are logged.
 */
export async function sendEmailBatch(msgs: readonly EmailMessage[]): Promise<{ sent: number; failed: number }> {
  if (msgs.length === 0) return { sent: 0, failed: 0 };
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info("sendEmailBatch: RESEND_API_KEY / EMAIL_FROM not set, skipping", msgs.length, msgs[0].subject);
    return { sent: 0, failed: msgs.length };
  }
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < msgs.length; i += BATCH_SIZE) {
    const chunk = msgs.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }))),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        sent += chunk.length;
      } else {
        const body = await res.text().catch(() => "");
        console.error("sendEmailBatch: Resend rejected", res.status, body.slice(0, 300));
        failed += chunk.length;
      }
    } catch (e) {
      console.error("sendEmailBatch: request failed", e);
      failed += chunk.length;
    }
  }
  return { sent, failed };
}

/** Escape text for safe interpolation into email HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
