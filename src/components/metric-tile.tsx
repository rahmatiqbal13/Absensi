import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetricStatus = "neutral" | "good" | "warn" | "bad";

const STATUS_COLOR: Record<MetricStatus, string> = {
  neutral: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-500",
  warn: "text-amber-600 dark:text-amber-500",
  bad: "text-destructive",
};

export function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  status = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  status?: MetricStatus;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("flex items-center gap-1.5 text-lg font-semibold tabular-nums", STATUS_COLOR[status])}>
        {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
