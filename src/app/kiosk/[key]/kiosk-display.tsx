"use client";

import { useEffect, useRef, useState } from "react";
import { QR_WINDOW_MS } from "@/lib/attendance/qr-token";
import { formatJakartaLong, jakartaClock, useNow } from "@/lib/time/use-now";
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
  // When the current QR stops verifying, for the countdown ring.
  const [deadline, setDeadline] = useState<number | null>(null);
  const now = useNow(250);
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
          setDeadline(Date.now() + result.remainingMs);
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
      <main className="flex min-h-screen items-center justify-center bg-[#1c1b18] p-8 text-center">
        <p className="text-lg text-[#f2eee5]/70">Kiosk tidak aktif.</p>
      </main>
    );
  }

  const clock = now ? jakartaClock(now) : null;
  const leftSec =
    deadline && now ? Math.max(0, Math.ceil((deadline - now.getTime()) / 1000)) : null;
  const windowSec = QR_WINDOW_MS / 1000;
  const ringDeg = leftSec != null ? (leftSec / windowSec) * 360 : 0;

  // The kiosk is a fixed dark wall display regardless of the viewer's theme.
  return (
    <main className="grid min-h-screen grid-cols-1 items-center gap-12 bg-[#1c1b18] p-8 text-[#f2eee5] md:p-12 lg:grid-cols-2">
      <div className="flex flex-col gap-4.5">
        <span className="font-mono text-[0.8rem] tracking-[0.12em] text-[#f2eee5]/65 uppercase">
          Kiosk · {branchNama}
        </span>
        <span
          className="text-[min(16vw,10rem)] leading-[0.85] font-semibold tracking-[-0.05em] tabular-nums"
          aria-label={clock ? `Pukul ${clock.hm} WIB` : undefined}
        >
          {clock?.hm ?? "--:--"}
        </span>
        {now && <span className="font-mono text-sm text-[#f2eee5]/65">{formatJakartaLong(now)}</span>}
        <p className="max-w-[460px] text-[1.375rem] leading-snug text-[#f2eee5]/85">
          Buka aplikasi Absensi, pilih <b className="text-[#f2eee5]">Scan QR</b>, lalu arahkan kamera ke kode ini.
        </p>
      </div>

      <div className="flex flex-col items-center gap-5.5">
        <div className="rounded-3xl bg-[#fffdf8] p-5.5">
          {dataUrl ? (
            // A rotating base64 QR — next/image optimization does not apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} width={360} height={360} alt="QR absen" className="size-[min(70vw,360px)]" />
          ) : (
            <div className="grid size-[min(70vw,360px)] place-items-center text-[#5e5a51]">Memuat…</div>
          )}
        </div>

        <div className="flex items-center gap-3.5">
          {/* A rotating ring would be pure decoration under reduced motion; the
              number inside still counts down. */}
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-full"
            style={{ background: `conic-gradient(#e0482a ${ringDeg}deg, rgb(242 238 229 / 0.15) 0)` }}
          >
            <span className="grid size-[34px] place-items-center rounded-full bg-[#1c1b18] font-mono text-[0.8rem] font-semibold">
              {leftSec ?? "–"}
            </span>
          </span>
          <span className="text-[0.95rem] text-[#f2eee5]/80">Kode berganti otomatis setiap {windowSec} detik.</span>
        </div>
      </div>
    </main>
  );
}
