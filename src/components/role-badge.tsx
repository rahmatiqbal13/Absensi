import type { Role } from "@/lib/auth/route-access";

const CONFIG: Record<Role, { label: string; bg: string; fg: string }> = {
  karyawan: { label: "Karyawan", bg: "bg-neutral-100", fg: "text-neutral-700" },
  atasan: { label: "Atasan", bg: "bg-blue-50", fg: "text-blue-700" },
  hr_admin: { label: "HR Admin", bg: "bg-violet-50", fg: "text-violet-700" },
  super_admin: { label: "Super Admin", bg: "bg-amber-50", fg: "text-amber-700" },
};

export function RoleBadge({ role }: { role: Role }) {
  const c = CONFIG[role];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium ${c.bg} ${c.fg}`}
    >
      <svg
        role="img"
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20c1.4-3.5 3.8-5.2 7.5-5.2s6.1 1.7 7.5 5.2" strokeLinecap="round" />
      </svg>
      <span>{c.label}</span>
    </span>
  );
}
