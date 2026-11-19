import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "pengumuman", label: "Pengumuman", href: "/pengumuman" },
  { key: "reminder", label: "Reminder", href: "/pengumuman/reminder" },
] as const;

/** HR only: switches between posted announcements and the attendance reminders. */
export function PengumumanTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Jenis informasi" className="grid h-11 grid-cols-2 rounded-xl bg-secondary p-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "grid place-items-center rounded-[9px] text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
            t.key === active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
