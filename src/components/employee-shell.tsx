"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, FileText, LayoutDashboard, ListChecks, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/absen", label: "Absen", Icon: Clock },
  // Cuti, lembur & dinas luar: /cuti and /pengajuan share one tab strip.
  { href: "/cuti", label: "Pengajuan", Icon: CalendarDays, also: ["/pengajuan"] },
  { href: "/riwayat", label: "Riwayat", Icon: ListChecks },
  { href: "/slip-gaji", label: "Slip Gaji", Icon: FileText },
  { href: "/profil", label: "Profil", Icon: User },
] as const;

export function EmployeeShell({
  brand,
  footer,
  notifications,
  hideSlipGaji = false,
  adminHref,
  children,
}: {
  brand: React.ReactNode;
  footer: React.ReactNode;
  /** Interns (status magang) have no payroll, so no Slip Gaji tab. */
  hideSlipGaji?: boolean;
  /** For HR / atasan / super admin: a way back to the admin panel. */
  adminHref?: string;
  /** The notification bell, rendered by the server layout. */
  notifications?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = hideSlipGaji ? NAV.filter((n) => n.href !== "/slip-gaji") : NAV;
  return (
    <div className={cn("flex min-h-screen flex-col bg-background text-foreground", pathname === "/absen" && "motif-batik-page")}>
      <header className="flex h-14 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        {brand}
        <div className="flex items-center gap-1">
          {adminHref && (
            <Link
              href={adminHref}
              className="mr-1 inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Panel admin
            </Link>
          )}
          {notifications}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
        <main className="flex-1">{children}</main>
        {footer}
      </div>

      <nav
        aria-label="Navigasi bawah"
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md",
          nav.length === 4 ? "grid-cols-4" : "grid-cols-5",
        )}
      >
        {nav.map((item) => {
          const { href, label, Icon } = item;
          const prefixes = [href, ...("also" in item ? item.also : [])];
          const active = prefixes.some((p) => pathname === p || pathname?.startsWith(`${p}/`));
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
