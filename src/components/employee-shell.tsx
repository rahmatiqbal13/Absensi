import Link from "next/link";

const NAV_ITEMS = [
  { href: "/absen", label: "Absen" },
  { href: "/cuti", label: "Cuti" },
  { href: "/riwayat", label: "Riwayat" },
  { href: "/profil", label: "Profil" },
];

export function EmployeeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pb-16">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 flex border-t bg-white">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center py-2 text-base"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
