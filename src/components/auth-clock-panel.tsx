"use client";

import { formatJakartaLong, jakartaClock, useNow } from "@/lib/time/use-now";

/** The ink side of the login split: today's date and a large live WIB clock. */
export function AuthClockPanel({ tagline }: { tagline: string }) {
  const now = useNow();
  const c = now ? jakartaClock(now) : null;
  return (
    <div className="flex flex-col gap-4">
      <span className="font-mono text-[0.8rem] text-sidebar-muted">{now ? formatJakartaLong(now) : " "}</span>
      <span
        className="text-[min(10vw,9.25rem)] leading-[0.85] font-semibold tracking-[-0.05em] tabular-nums"
        aria-label={c ? `Pukul ${c.hm} WIB` : undefined}
      >
        {c?.hm ?? "--:--"}
      </span>
      <span className="max-w-[420px] text-lg leading-relaxed text-sidebar-muted">{tagline}</span>
    </div>
  );
}
