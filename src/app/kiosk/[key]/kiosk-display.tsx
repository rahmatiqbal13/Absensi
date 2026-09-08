"use client";

import { useEffect, useState } from "react";
import { QR_WINDOW_MS } from "@/lib/attendance/qr-token";
import { getKioskQr } from "./actions";

const FAILURE_RETRY_MS = 5000;
const MIN_REFRESH_MS = 1000;

export function KioskDisplay({
  kioskKey,
  branchNama,
}: {
  kioskKey: string;
  branchNama: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(QR_WINDOW_MS);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      let nextDelay = FAILURE_RETRY_MS;
      try {
        const result = await getKioskQr(kioskKey);
        if (!active) return;
        if (result.ok) {
          setDataUrl(result.dataUrl);
          setRemainingMs(result.remainingMs);
          nextDelay = Math.max(result.remainingMs, MIN_REFRESH_MS);
        }
        // On !ok we keep the last QR on screen and just retry after FAILURE_RETRY_MS.
      } catch {
        // A network blip must never blank the screen — keep the last QR, retry soon.
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

  const barWidth = `${Math.max(0, Math.min(1, remainingMs / QR_WINDOW_MS)) * 100}%`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-950 p-8 text-center text-neutral-100">
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
        <div
          className="h-full bg-neutral-100 transition-[width] duration-1000 ease-linear"
          style={{ width: barWidth }}
        />
      </div>

      <p className="text-sm text-neutral-400">
        Scan dengan aplikasi absensi. Kode berganti otomatis.
      </p>
    </main>
  );
}
