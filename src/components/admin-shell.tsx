"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  ListChecks,
  LayoutDashboard,
  Megaphone,
  Menu,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { ProductLogo } from "@/components/product-logo";
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
  /** Icon tint on the navy sidebar (redesign: one hue per area). */
  tint: string;
  hrAdminOnly?: boolean;
  countKey?: "pendingLeave" | "pendingCorrection" | "pendingRequests";
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Hari ini",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard, tint: "#A5B4FC" },
      { href: "/pengumuman", label: "Pengumuman", Icon: Megaphone, tint: "#A5B4FC" },
      { href: "/persetujuan-cuti", label: "Persetujuan cuti", Icon: CalendarCheck, tint: "#C4B5FD", countKey: "pendingLeave" },
      {
        href: "/persetujuan-koreksi",
        label: "Koreksi absensi",
        Icon: ClipboardCheck,
        tint: "#C4B5FD",
        countKey: "pendingCorrection",
      },
      {
        href: "/persetujuan-pengajuan",
        label: "Lembur & dinas luar",
        Icon: ClipboardList,
        tint: "#C4B5FD",
        countKey: "pendingRequests",
      },
    ],
  },
  {
    // PRD: admins who are employees clock in through the same flow as everyone.
    title: "Absensi saya",
    items: [
      { href: "/absen", label: "Absen", Icon: Clock, tint: "#86EFAC" },
      { href: "/cuti", label: "Pengajuan saya", Icon: CalendarDays, tint: "#86EFAC" },
      { href: "/riwayat", label: "Riwayat absen", Icon: ListChecks, tint: "#86EFAC" },
      { href: "/slip-gaji", label: "Slip gaji saya", Icon: FileText, tint: "#86EFAC" },
    ],
  },
  { title: "Orang", items: [{ href: "/karyawan", label: "Karyawan", Icon: Users, tint: "#7DD3FC", hrAdminOnly: true }] },
  {
    title: "Angka",
    items: [
      { href: "/laporan", label: "Laporan", Icon: BarChart3, tint: "#FCD34D" },
      { href: "/payroll", label: "Payroll", Icon: Wallet, tint: "#6EE7B7", hrAdminOnly: true },
    ],
  },
  { title: "Sistem", items: [{ href: "/pengaturan", label: "Pengaturan", Icon: Settings, tint: "#F9A8D4" }] },
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
  pendingCorrection,
  pendingRequests = 0,
  onNavigate,
}: {
  role: CurrentEmployee["role"];
  pendingLeave: number;
  pendingCorrection: number;
  pendingRequests?: number;
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
          {g.items.map(({ href, label, Icon, tint, countKey }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            const count =
              countKey === "pendingLeave"
                ? pendingLeave
                : countKey === "pendingCorrection"
                  ? pendingCorrection
                  : countKey === "pendingRequests"
                    ? pendingRequests
                    : 0;
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
                <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" style={{ color: tint }} />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span className="grid h-5 min-w-[22px] place-items-center rounded-full bg-highlight px-1.5 text-[0.7rem] font-bold text-highlight-foreground">
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
            <AvatarFallback className="bg-[#C4B5FD] text-xs font-semibold text-[#14162E]">
              {initialsOf(employee.nama)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col items-start gap-1 overflow-hidden">
            <span className="max-w-full truncate text-sm font-semibold">{employee.nama}</span>
            <RoleBadge role={employee.role} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground">{employee.email ?? "—"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profil">Profil</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Keep the menu open while signing out so the pending state stays visible. */}
        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
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
  pendingCorrection,
  pendingRequests = 0,
  notifications,
  onNavigate,
}: {
  employee: CurrentEmployee;
  avatarUrl?: string;
  brand: React.ReactNode;
  pendingLeave: number;
  pendingCorrection: number;
  pendingRequests?: number;
  notifications?: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col gap-6 px-3.5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-between gap-2 px-2">
        <div className="min-w-0">{brand}</div>
        {notifications && <div className="-mt-1 -mr-1 shrink-0 [&_button]:text-sidebar-muted [&_button:hover]:bg-sidebar-accent [&_button:hover]:text-sidebar-foreground">{notifications}</div>}
      </div>
      <ClockCard />
      <AdminNav
        role={employee.role}
        pendingLeave={pendingLeave}
        pendingCorrection={pendingCorrection}
        pendingRequests={pendingRequests}
        onNavigate={onNavigate}
      />
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
  pendingCorrection = 0,
  pendingRequests = 0,
  notifications,
  children,
}: {
  employee: CurrentEmployee;
  avatarUrl?: string;
  brand: React.ReactNode;
  footer: React.ReactNode;
  pendingLeave?: number;
  pendingCorrection?: number;
  pendingRequests?: number;
  /** The notification bell, rendered by the server layout. */
  notifications?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="motif-batik hidden w-[248px] shrink-0 overflow-y-auto bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:block lg:h-screen">
        <SidebarBody
          employee={employee}
          avatarUrl={avatarUrl}
          brand={brand}
          pendingLeave={pendingLeave}
          pendingCorrection={pendingCorrection}
          pendingRequests={pendingRequests}
          notifications={notifications}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[58px] shrink-0 items-center justify-between bg-sidebar px-4 text-sidebar-foreground lg:hidden">
          <ProductLogo size={30} />
          <div className="flex items-center gap-2">
            {notifications && <div className="[&_button]:text-sidebar-muted [&_button:hover]:bg-sidebar-accent [&_button:hover]:text-sidebar-foreground">{notifications}</div>}
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
                className="motif-batik block w-[280px] overflow-y-auto overscroll-contain border-0 bg-sidebar p-0 text-sidebar-foreground data-[side=left]:h-dvh data-[side=left]:w-[280px]"
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
                  pendingCorrection={pendingCorrection}
                  pendingRequests={pendingRequests}
                  onNavigate={() => setOpen(false)}
                />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 pt-5 pb-10 lg:px-10 lg:pt-9 lg:pb-12">
          {children}
        </main>
        {footer}
      </div>
    </div>
  );
}
