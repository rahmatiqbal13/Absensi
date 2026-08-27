"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/absen",
    label: "Absen",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    href: "/cuti",
    label: "Cuti",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/riwayat",
    label: "Riwayat",
    icon: (
      <>
        <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/profil",
    label: "Profil",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5" strokeLinecap="round" />
      </>
    ),
  },
];

export function EmployeeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <main className="flex-1 pb-20">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                active ? "text-blue-600" : "text-neutral-500"
              }`}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? 2.25 : 2}
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
