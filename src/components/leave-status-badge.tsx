export type LeaveStatus = "pending" | "approved" | "rejected";

const STATUS_CONFIG: Record<
  LeaveStatus,
  { label: string; bg: string; fg: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Menunggu",
    bg: "bg-amber-50",
    fg: "text-amber-700",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  approved: {
    label: "Disetujui",
    bg: "bg-green-50",
    fg: "text-green-700",
    icon: <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />,
  },
  rejected: {
    label: "Ditolak",
    bg: "bg-red-50",
    fg: "text-red-700",
    icon: (
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
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
