import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
