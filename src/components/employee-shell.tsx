"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, FileText, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/absen", label: "Absen", Icon: Clock },
  { href: "/cuti", label: "Cuti", Icon: CalendarDays },
  { href: "/riwayat", label: "Riwayat", Icon: ListChecks },
  { href: "/slip-gaji", label: "Slip Gaji", Icon: FileText },
] as const;

export function EmployeeShell({
  brand,
  footer,
  children,
}: {
  brand: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-start border-b border-border bg-background/95 px-4 backdrop-blur">
        {brand}
      </header>

      <div className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <main className="flex-1">{children}</main>
        {footer}
      </div>

      <nav
        aria-label="Navigasi bawah"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
