export type PayrollStatus = "draft" | "final";

const STATUS_CONFIG: Record<
  PayrollStatus,
  { label: string; bg: string; fg: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    bg: "bg-amber-50",
    fg: "text-amber-700",
    icon: (
      <>
        <path d="M12 20h9" strokeLinecap="round" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
      </>
    ),
  },
  final: {
    label: "Final",
    bg: "bg-green-50",
    fg: "text-green-700",
    icon: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
      </>
    ),
  },
};

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
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
