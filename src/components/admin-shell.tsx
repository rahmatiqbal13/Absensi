import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/karyawan", label: "Karyawan" },
  { href: "/persetujuan-cuti", label: "Cuti" },
  { href: "/laporan", label: "Laporan" },
  { href: "/payroll", label: "Payroll" },
  { href: "/pengaturan", label: "Pengaturan" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r p-4">
        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-3 py-2 text-sm">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
