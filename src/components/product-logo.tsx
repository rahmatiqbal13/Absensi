import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The "absensi" product mark: indigo tile with an "a" glyph and an amber dot.
 * Distinct from <BrandMark />, which shows the tenant (instansi) logo.
 */
export function ProductLogo({
  size = 34,
  wordmark = true,
  tone = "inverse",
  className,
}: {
  size?: number;
  wordmark?: boolean;
  /** "inverse" = on the navy sidebar / auth panel; "default" = on light surfaces. */
  tone?: "inverse" | "default";
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = `al-g-${uid}`;
  const r = `al-r-${uid}`;
  const a = `al-a-${uid}`;
  return (
    <span role="img" aria-label="absensi" className={cn("flex items-center gap-2.5", className)}>
      <svg aria-hidden="true" viewBox="0 0 96 96" width={size} height={size} className="block shrink-0">
        <defs>
          <linearGradient id={g} x1="10" y1="0" x2="86" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7C6CFF" />
            <stop offset=".55" stopColor="#4A3FDB" />
            <stop offset="1" stopColor="#2B2090" />
          </linearGradient>
          <radialGradient id={r} cx="24" cy="10" r="70" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".34" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={a} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE08A" />
            <stop offset="1" stopColor="#FFB020" />
          </linearGradient>
        </defs>
        <rect width="96" height="96" rx="29" fill={`url(#${g})`} />
        <rect width="96" height="96" rx="29" fill={`url(#${r})`} />
        <rect x=".75" y=".75" width="94.5" height="94.5" rx="28.3" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="1.5" />
        <circle cx="43" cy="54" r="19" fill="none" stroke="#fff" strokeWidth="11" />
        <path d="M62 74 V44" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
        <circle cx="62" cy="25" r="7.5" fill={`url(#${a})`} />
      </svg>
      {wordmark && (
        <span
          aria-hidden="true"
          className={cn(
            "leading-none font-extrabold tracking-[-0.035em]",
            tone === "inverse" ? "text-sidebar-accent-foreground" : "text-foreground",
          )}
          style={{ fontSize: Math.round(size * 0.65) }}
        >
          absensi
        </span>
      )}
    </span>
  );
}
