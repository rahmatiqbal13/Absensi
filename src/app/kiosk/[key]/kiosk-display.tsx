"use client";

import { useEffect, useRef, useState } from "react";
import { QR_WINDOW_MS } from "@/lib/attendance/qr-token";
import { getKioskQr } from "./actions";

const FAILURE_RETRY_MS = 5000;
const MIN_REFRESH_MS = 1000;
// After this many consecutive definitive { ok: false } responses, the branch is
// disabled or the key was rotated — stop showing a QR that no longer verifies.
const MAX_CONSECUTIVE_FAILURES = 3;

export function KioskDisplay({
  kioskKey,
  branchNama,
}: {
  kioskKey: string;
  branchNama: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [inactive, setInactive] = useState(false);
  const failureCountRef = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      let nextDelay = FAILURE_RETRY_MS;
      try {
        const result = await getKioskQr(kioskKey);
        if (!active) return;
        if (result.ok) {
          failureCountRef.current = 0;
          setInactive(false);
          setDataUrl(result.dataUrl);
          nextDelay = Math.max(result.remainingMs, MIN_REFRESH_MS);
        } else {
          // A returned { ok: false } is definitive (disabled branch / rotated
          // key), not a blip. Keep the last QR for a couple of tries, then
          // switch to the inactive state.
          failureCountRef.current += 1;
          if (failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
            setInactive(true);
          }
        }
      } catch {
        // A thrown/network error is transient — keep the last QR, retry soon,
        // and do NOT count it toward the disable threshold.
        if (!active) return;
      }
      timer = setTimeout(refresh, nextDelay);
    }

    refresh();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [kioskKey]);

  if (inactive) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-8 text-center">
        <p className="text-lg text-neutral-400">Kiosk tidak aktif.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-950 p-8 text-center text-neutral-100">
      <style>{`@keyframes kiosk-countdown { from { width: 100%; } to { width: 0%; } }`}</style>
      <h1 className="text-2xl font-semibold">{branchNama}</h1>

      <div className="rounded-2xl bg-white p-4">
        {dataUrl ? (
          // A rotating base64 QR — next/image optimization does not apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} width={320} height={320} alt="QR absen" />
        ) : (
          <div className="flex h-[320px] w-[320px] items-center justify-center text-neutral-500">
            Memuat…
          </div>
        )}
      </div>

      <div className="h-1 w-[320px] overflow-hidden rounded-full bg-neutral-800">
        {dataUrl && (
          <div
            key={dataUrl}
            className="h-full bg-neutral-100"
            style={{
              animation: `kiosk-countdown ${QR_WINDOW_MS}ms linear forwards`,
            }}
          />
        )}
      </div>

      <p className="text-sm text-neutral-400">
        Scan dengan aplikasi absensi. Kode berganti otomatis.
      </p>
    </main>
  );
}
