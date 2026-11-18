"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { NotificationJenis } from "./create";

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
