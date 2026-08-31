import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
