import type { AttendanceStatus } from "@/lib/attendance/status";

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; bg: string; fg: string; icon: React.ReactNode }
> = {
  tepat_waktu: {
    label: "Tepat Waktu",
    bg: "bg-green-50",
    fg: "text-green-700",
    icon: (
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  terlambat: {
    label: "Terlambat",
    bg: "bg-amber-50",
    fg: "text-amber-700",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  pulang_cepat: {
    label: "Pulang Cepat",
    bg: "bg-sky-50",
    fg: "text-sky-700",
    icon: (
      <path
        d="M15 6 9 12l6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  alpa: {
    label: "Alpa",
    bg: "bg-red-50",
    fg: "text-red-700",
    icon: (
      <path
        d="M18 6 6 18M6 6l12 12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  di_luar_lokasi: {
    label: "Di Luar Lokasi",
    bg: "bg-orange-50",
    fg: "text-orange-700",
    icon: (
      <>
        <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
  },
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium ${config.bg} ${config.fg}`}
    >
      <svg
        role="img"
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        {config.icon}
      </svg>
      <span>{config.label}</span>
    </span>
  );
}
