"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { RoleBadge } from "@/components/role-badge";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CurrentEmployee } from "@/lib/auth/session";
import { formatJakartaShort, jakartaClock, useNow } from "@/lib/time/use-now";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  hrAdminOnly?: boolean;
  countKey?: "pendingLeave";
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Hari ini",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
      { href: "/persetujuan-cuti", label: "Cuti", Icon: CalendarCheck, countKey: "pendingLeave" },
    ],
  },
  { title: "Orang", items: [{ href: "/karyawan", label: "Karyawan", Icon: Users, hrAdminOnly: true }] },
  {
    title: "Angka",
    items: [
      { href: "/laporan", label: "Laporan", Icon: BarChart3 },
      { href: "/payroll", label: "Payroll", Icon: Wallet, hrAdminOnly: true },
    ],
  },
  { title: "Sistem", items: [{ href: "/pengaturan", label: "Pengaturan", Icon: Settings }] },
];

function initialsOf(nama: string) {
  return (
    nama
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function AdminNav({
  role,
  pendingLeave,
  onNavigate,
}: {
  role: CurrentEmployee["role"];
  pendingLeave: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isHr = role === "hr_admin" || role === "super_admin";
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.hrAdminOnly || isHr),
  })).filter((g) => g.items.length > 0);

  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          <span className="eyebrow px-2.5 pb-1.5 text-[0.65rem] text-sidebar-faint">{g.title}</span>
          {g.items.map(({ href, label, Icon, countKey }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            const count = countKey === "pendingLeave" ? pendingLeave : 0;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[9px] px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span className="grid h-5 min-w-[22px] place-items-center rounded-full bg-brand px-1.5 text-[0.7rem] font-bold text-brand-foreground">
                    <span className="sr-only">, </span>
                    {count}
                    <span className="sr-only"> menunggu</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function ClockCard() {
  const now = useNow();
  const c = now ? jakartaClock(now) : null;
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-sidebar-accent/50 p-3.5">
      <span className="font-mono text-[0.7rem] text-sidebar-faint uppercase">
        {now ? formatJakartaShort(now) : " "}
      </span>
      <span className="text-3xl font-semibold tracking-[-0.03em] tabular-nums">
        {c?.hm ?? "--:--"}
        <span className="font-mono text-[0.8rem] font-normal tracking-normal text-sidebar-faint">
          {" "}:{c?.s ?? "--"}
        </span>
      </span>
    </div>
  );
}

function UserMenu({ employee, avatarUrl }: { employee: CurrentEmployee; avatarUrl?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Menu pengguna: ${employee.nama}`}
          className="flex w-full min-w-0 items-center gap-2.5 rounded-[10px] p-2 text-left outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Avatar className="size-[34px] shrink-0">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-[#c9bba0] text-xs font-semibold text-[#1c1b18]">
              {initialsOf(employee.nama)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-semibold">{employee.nama}</span>
            <RoleBadge role={employee.role} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground">{employee.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profil">Profil</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <SignOutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({
  employee,
  avatarUrl,
  brand,
  pendingLeave,
  onNavigate,
}: {
  employee: CurrentEmployee;
  avatarUrl?: string;
  brand: React.ReactNode;
  pendingLeave: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 px-3.5 py-5">
      <div className="px-2">{brand}</div>
      <ClockCard />
      <AdminNav role={employee.role} pendingLeave={pendingLeave} onNavigate={onNavigate} />
      <div className="mt-auto flex items-center gap-1 border-t border-sidebar-border pt-3.5">
        <div className="min-w-0 flex-1">
          <UserMenu employee={employee} avatarUrl={avatarUrl} />
        </div>
        <ThemeToggle className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground" />
      </div>
    </div>
  );
}

export function AdminShell({
  employee,
  avatarUrl,
  brand,
  footer,
  pendingLeave = 0,
  children,
}: {
  employee: CurrentEmployee;
  avatarUrl?: string;
  brand: React.ReactNode;
  footer: React.ReactNode;
  pendingLeave?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-[248px] shrink-0 overflow-y-auto bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:block lg:h-screen">
        <SidebarBody employee={employee} avatarUrl={avatarUrl} brand={brand} pendingLeave={pendingLeave} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[58px] shrink-0 items-center justify-between bg-sidebar px-4 text-sidebar-foreground lg:hidden">
          {brand}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Buka menu"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-sidebar-foreground/25 px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Menu className="size-4" aria-hidden="true" />
                Menu
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[280px] border-0 bg-sidebar p-0 text-sidebar-foreground data-[side=left]:w-[280px]"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Menu navigasi</SheetTitle>
                <SheetDescription>Menu navigasi admin</SheetDescription>
              </SheetHeader>
              <SidebarBody
                employee={employee}
                avatarUrl={avatarUrl}
                brand={brand}
                pendingLeave={pendingLeave}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </header>

        <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 pt-5 pb-10 lg:px-10 lg:pt-9 lg:pb-12">
          {children}
        </main>
        {footer}
      </div>
    </div>
  );
}
