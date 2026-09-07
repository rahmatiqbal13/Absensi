import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldSection({
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
