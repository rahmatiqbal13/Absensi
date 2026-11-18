"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ClipboardList, Clock, FileSignature, FileText, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NotificationFeed, NotificationItem } from "@/lib/notifications/actions";
import { useNow } from "@/lib/time/use-now";
import { DevicePushToggle } from "@/components/device-push-toggle";
import { cn } from "@/lib/utils";

const REFRESH_MS = 2 * 60_000;
const RTF = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

function relativeTime(iso: string, now: number): string {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (Math.abs(minutes) < 1) return "baru saja";
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  return RTF.format(Math.round(hours / 24), "day");
}

const ICON = { lupa_absen: Clock, slip_gaji: FileText, kontrak: FileSignature, pengumuman: Megaphone, pengajuan: ClipboardList } as const;

/**
 * In-app notifications (lupa absen, slip gaji terbit). Polls every 2 minutes
 * and when the tab becomes visible again; opening the list marks everything
 * read. The server actions come from the (server) layout as props.
 */
export function NotificationBell({
  load,
  markRead,
  push,
  className,
}: {
  load: () => Promise<NotificationFeed>;
  markRead: () => Promise<void>;
  /** Web Push on this device (shown at the bottom of the list). */
  push?: { save: (sub: unknown) => Promise<{ ok: boolean }>; remove: (endpoint: string) => Promise<{ ok: boolean }> };
  className?: string;
}) {
  const [feed, setFeed] = useState<NotificationFeed>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  // Items that were unread when the list was opened keep their highlight.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const now = useNow(60_000);

  const refresh = useCallback(() => {
    load()
      .then(setFeed)
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && feed.unread > 0) {
      setFresh(new Set(feed.items.filter((n) => !n.read).map((n) => n.id)));
      setFeed((f) => ({ unread: 0, items: f.items.map((n) => ({ ...n, read: true })) }));
      markRead().catch(() => {});
    }
  }

  const label = feed.unread > 0 ? `Notifikasi, ${feed.unread} belum dibaca` : "Notifikasi";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className={cn("relative", className)}>
          <Bell className="size-4" aria-hidden="true" />
          {feed.unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger-solid px-1 text-[0.625rem] leading-none font-bold text-primary-foreground tabular-nums dark:text-foreground"
            >
              {feed.unread > 9 ? "9+" : feed.unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold">Notifikasi</p>
        {feed.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada notifikasi.</p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {feed.items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <Row n={n} now={now} fresh={fresh.has(n.id)} onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        )}
        {push && (
          <div className="border-t border-border px-4 py-3">
            <DevicePushToggle save={push.save} remove={push.remove} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Row({ n, now, fresh, onNavigate }: { n: NotificationItem; now: Date | null; fresh: boolean; onNavigate: () => void }) {
  const Icon = ICON[n.jenis] ?? Bell;
  const body = (
    <span className={cn("flex gap-3 px-4 py-3", fresh && "bg-secondary/60")}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{n.judul}</span>
        <span className="text-sm text-muted-foreground">{n.isi}</span>
        <span className="text-xs text-muted-foreground">{now ? relativeTime(n.createdAt, now.getTime()) : ""}</span>
      </span>
    </span>
  );
  return n.link ? (
    <Link href={n.link} onClick={onNavigate} className="block outline-none hover:bg-muted focus-visible:bg-muted">
      {body}
    </Link>
  ) : (
    body
  );
}
