"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, FileText, ListChecks, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/absen", label: "Absen", Icon: Clock },
  { href: "/cuti", label: "Cuti", Icon: CalendarDays },
  { href: "/riwayat", label: "Riwayat", Icon: ListChecks },
  { href: "/slip-gaji", label: "Slip Gaji", Icon: FileText },
  { href: "/profil", label: "Profil", Icon: User },
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
      <header className="flex h-14 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        {brand}
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
        <main className="flex-1">{children}</main>
        {footer}
      </div>

      <nav
        aria-label="Navigasi bawah"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
      >
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-13 flex-col items-center justify-center gap-1 rounded-lg text-[0.72rem] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-11 place-items-center rounded-full transition-colors",
                  active ? "bg-secondary" : "group-hover:bg-muted",
                )}
              >
                <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
