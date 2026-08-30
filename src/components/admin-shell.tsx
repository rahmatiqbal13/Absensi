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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/karyawan", label: "Karyawan", Icon: Users, hrAdminOnly: true },
  { href: "/persetujuan-cuti", label: "Cuti", Icon: CalendarCheck },
  { href: "/laporan", label: "Laporan", Icon: BarChart3 },
  { href: "/payroll", label: "Payroll", Icon: Wallet, hrAdminOnly: true },
  { href: "/pengaturan", label: "Pengaturan", Icon: Settings },
] as const;

function AdminNav({
  role,
  onNavigate,
}: {
  role: CurrentEmployee["role"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV.filter(
    (i) =>
      !("hrAdminOnly" in i && i.hrAdminOnly) ||
      role === "hr_admin" ||
      role === "super_admin",
  );
  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-1 p-2">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({
  employee,
  avatarUrl,
}: {
  employee: CurrentEmployee;
  avatarUrl?: string;
}) {
  const initials =
    employee.nama
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 px-2"
          aria-label={`Menu pengguna: ${employee.nama}`}
        >
          <Avatar className="h-7 w-7">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{employee.nama}</span>
          <RoleBadge role={employee.role} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {employee.email}
        </DropdownMenuLabel>
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

export function AdminShell({
  employee,
  avatarUrl,
  brand,
  footer,
  children,
}: {
  employee: CurrentEmployee;
  avatarUrl?: string;
  brand: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="p-4">{brand}</div>
        <AdminNav role={employee.role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 data-[side=left]:w-64">
              <SheetHeader className="p-4">
                <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
                <SheetDescription className="sr-only">Menu navigasi admin</SheetDescription>
                {brand}
              </SheetHeader>
              <AdminNav role={employee.role} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-2">
            <UserMenu employee={employee} avatarUrl={avatarUrl} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
        {footer}
      </div>
    </div>
  );
}
