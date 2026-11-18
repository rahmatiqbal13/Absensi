import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushMessage = { employeeId: string; title: string; body: string; link: string | null; tag: string };

let configured: boolean | null = null;
/** VAPID keys come from env (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); without them push is off. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://tapabsen.vercel.app", pub, priv);
  configured = true;
  return true;
}

/**
 * Sends each message to every device its employee subscribed. Best effort:
 * a failed push never fails the notification itself (it is in the bell
 * anyway). Subscriptions the push service reports as gone are deleted.
 * `db` must be the service-role client.
 */
export async function sendPush(db: SupabaseClient, messages: readonly PushMessage[]): Promise<{ sent: number; failed: number }> {
  if (messages.length === 0 || !ensureConfigured()) return { sent: 0, failed: 0 };
  const ids = [...new Set(messages.map((m) => m.employeeId))];
  const { data, error } = await db
    .from("push_subscriptions")
    .select("id, employee_id, endpoint, p256dh, auth")
    .in("employee_id", ids);
  if (error) {
    // Pre-0055: no table yet — push is simply off.
    console.warn("sendPush: subscriptions lookup failed", error.message);
    return { sent: 0, failed: 0 };
  }
  const subs = (data ?? []) as { id: string; employee_id: string; endpoint: string; p256dh: string; auth: string }[];

  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    messages.flatMap((m) =>
      subs
        .filter((s) => s.employee_id === m.employeeId)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: m.title, body: m.body, link: m.link, tag: m.tag }),
              { TTL: 12 * 3600, urgency: "high" },
            );
            sent += 1;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.push(s.id);
            else console.error("sendPush: delivery failed", status ?? e);
            failed += 1;
          }
        }),
    ),
  );
  if (gone.length) {
    const { error: delErr } = await db.from("push_subscriptions").delete().in("id", gone);
    if (delErr) console.error("sendPush: cleanup failed", delErr);
  }
  return { sent, failed };
}
