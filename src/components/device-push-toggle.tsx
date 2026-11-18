"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Save = (sub: unknown) => Promise<{ ok: boolean }>;
type Remove = (endpoint: string) => Promise<{ ok: boolean }>;

type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function base64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * "Notifikasi di perangkat ini": Web Push so reminders and payslip notices
 * show while the app is closed. iPhone only allows it for the home-screen app.
 */
export function DevicePushToggle({ save, remove }: { save: Save; remove: Remove }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID;
      if (!supported) {
        if (!cancelled) setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      // Keep the server copy in step (e.g. a new account on this browser).
      if (sub) save(sub.toJSON()).catch(() => {});
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [save]);

  async function enable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID!) }));
      const r = await save(sub.toJSON());
      setState(r.ok ? "on" : "off");
    } catch (e) {
      console.error("enable push failed", e);
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remove(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  const note = "text-xs text-muted-foreground";
  switch (state) {
    case "checking":
      return null;
    case "unsupported":
      return <p className={note}>Browser ini belum mendukung notifikasi saat aplikasi ditutup.</p>;
    case "ios-install":
      return (
        <p className={`${note} flex gap-1.5`}>
          <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Di iPhone, pasang aplikasi dulu: tombol Bagikan → Tambahkan ke Layar Utama, lalu buka dari ikon itu.
        </p>
      );
    case "denied":
      return <p className={note}>Notifikasi diblokir. Izinkan di pengaturan browser/HP untuk situs ini.</p>;
    case "on":
      return (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-success-foreground">
            <BellRing className="size-3.5" aria-hidden="true" /> Aktif di perangkat ini
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={disable}>
            <BellOff className="size-3.5" aria-hidden="true" /> Matikan
          </Button>
        </div>
      );
    default:
      return (
        <Button variant="outline" size="sm" className="w-full" disabled={state === "busy"} onClick={enable}>
          <BellRing className="size-4" aria-hidden="true" />
          {state === "busy" ? "Mengaktifkan…" : "Aktifkan notifikasi di perangkat ini"}
        </Button>
      );
  }
}
