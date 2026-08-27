"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <rect x="3" y="3" width="7" height="9" rx="1.5" />,
    icon2: (
      <>
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
  },
  {
    href: "/karyawan",
    label: "Karyawan",
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c1.2-3 3.2-4.5 6-4.5s4.8 1.5 6 4.5" strokeLinecap="round" />
        <circle cx="17.5" cy="9" r="2.2" />
        <path d="M15.5 15.2c1.6.4 2.8 1.6 3.7 3.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/persetujuan-cuti",
    label: "Cuti",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/laporan",
    label: "Laporan",
    icon: (
      <path
        d="M4 20V10M11 20V4M18 20v-7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/payroll",
    label: "Payroll",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  },
  {
    href: "/pengaturan",
    label: "Pengaturan",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 13.5c.1-.5.1-1 0-1.5l1.7-1.3-1.5-2.6-2 .6a7 7 0 0 0-1.3-.8L16 5.5h-3l-.3 2.4c-.5.2-.9.5-1.3.8l-2-.6-1.5 2.6 1.7 1.3c-.1.5-.1 1 0 1.5l-1.7 1.3 1.5 2.6 2-.6c.4.3.8.6 1.3.8l.3 2.4h3l.3-2.4c.5-.2.9-.5 1.3-.8l2 .6 1.5-2.6z"
          strokeLinejoin="round"
        />
      </>
    ),
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white px-4 py-6">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white">
            A
          </div>
          <span className="text-sm font-semibold text-neutral-900">Absensi HR</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.25 : 2}
                  className="shrink-0"
                >
                  {item.icon}
                  {"icon2" in item ? item.icon2 : null}
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
