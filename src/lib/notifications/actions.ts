"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { NotificationJenis } from "./create";
import { sendPush } from "./push";

export type NotificationItem = {
  id: string;
  jenis: NotificationJenis;
  judul: string;
  isi: string;
  link: string | null;
  createdAt: string;
  read: boolean;
};

export type NotificationFeed = { unread: number; items: NotificationItem[] };

const EMPTY: NotificationFeed = { unread: 0, items: [] };

/** The viewer's latest notifications and unread count (RLS: own rows only). */
export async function getMyNotifications(): Promise<NotificationFeed> {
  const db = await createServerSupabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return EMPTY;

  const [listRes, countRes] = await Promise.all([
    db
      .from("notifications")
      .select("id, jenis, judul, isi, link, created_at, read_at")
      .eq("employee_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", user.id)
      .is("read_at", null),
  ]);
  if (listRes.error || countRes.error) {
    // Pre-0048 the table doesn't exist yet: show an empty bell, not an error.
    console.error("getMyNotifications: query failed", listRes.error ?? countRes.error);
    return EMPTY;
  }
  return {
    unread: countRes.count ?? 0,
    items: (listRes.data ?? []).map((n) => ({
      id: n.id as string,
      jenis: n.jenis as NotificationJenis,
      judul: n.judul as string,
      isi: n.isi as string,
      link: (n.link as string | null) ?? null,
      createdAt: n.created_at as string,
      read: n.read_at !== null,
    })),
  };
}

/** Marks every unread notification of the viewer as read. */
export async function markMyNotificationsRead(): Promise<void> {
  const db = await createServerSupabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return;
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("employee_id", user.id)
    .is("read_at", null);
  if (error) console.error("markMyNotificationsRead: update failed", error);
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

function validSubscription(sub: unknown): sub is PushSubscriptionInput {
  const s = sub as PushSubscriptionInput | null;
  if (!s || typeof s.endpoint !== "string" || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return false;
  try {
    return new URL(s.endpoint).protocol === "https:" && s.endpoint.length < 1000;
  } catch {
    return false;
  }
}

/**
 * Remembers this device for Web Push (0055). Saved with the service role so a
 * browser that changes hands (shared PC) moves to the person now signed in.
 */
export async function savePushSubscription(sub: unknown): Promise<{ ok: boolean }> {
  if (!validSubscription(sub)) return { ok: false };
  const db = await createServerSupabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false };
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const service = createServiceRoleSupabaseClient();
  const { data: existing } = await service.from("push_subscriptions").select("employee_id").eq("endpoint", sub.endpoint).maybeSingle();
  const { error } = await service
    .from("push_subscriptions")
    .upsert(
      { employee_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("savePushSubscription: upsert failed", error);
    return { ok: false };
  }
  // First time on this device (for this person): a test notice proves it works.
  if (existing?.employee_id !== user.id) {
    await sendPush(service, [
      {
        employeeId: user.id,
        title: "Notifikasi aktif",
        body: "Pengingat absen dan slip gaji akan muncul di perangkat ini, walau aplikasi ditutup.",
        link: "/absen",
        tag: "push-aktif",
      },
    ]).catch(() => {});
  }
  return { ok: true };
}

/** Forgets this device (the user turned device notifications off). */
export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  if (typeof endpoint !== "string" || !endpoint) return { ok: false };
  const db = await createServerSupabaseClient();
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) console.error("removePushSubscription: delete failed", error);
  return { ok: !error };
}
