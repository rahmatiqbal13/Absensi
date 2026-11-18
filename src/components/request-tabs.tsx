import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "cuti", label: "Cuti", href: "/cuti" },
  { key: "lembur", label: "Lembur", href: "/pengajuan?jenis=lembur" },
  { key: "dinas_luar", label: "Dinas luar", href: "/pengajuan?jenis=dinas_luar" },
] as const;

/** Switches between the three kinds of request an employee can file. */
export function RequestTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Jenis pengajuan" className="grid h-11 grid-cols-3 rounded-xl bg-secondary p-1">
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
