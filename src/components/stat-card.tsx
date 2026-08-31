import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardTone = "default" | "warning" | "destructive" | "accent";

const VALUE_TONE: Record<StatCardTone, string> = {
  default: "text-foreground",
  warning: "text-amber-600 dark:text-amber-500",
  destructive: "text-destructive",
  accent: "text-primary",
};

export function StatCard({
  label,
  value,
  sublabel,
  tone = "default",
  icon: Icon,
  href,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  tone?: StatCardTone;
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
        <span>{label}</span>
        {href && tone === "accent" ? (
          <ArrowRight className="ml-auto size-4 text-primary" aria-hidden="true" />
        ) : null}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", VALUE_TONE[tone])}>{value}</div>
      {sublabel ? <div className="text-xs text-muted-foreground">{sublabel}</div> : null}
    </>
  );

  const cardClass = cn(
    "gap-1 px-4",
    tone === "accent" && "ring-primary/30",
    href && "transition-colors hover:bg-muted/40",
    href && tone === "accent" && "hover:ring-primary/50",
  );

  if (href) {
    return (
      <Link href={href} className="block">
        <Card size="sm" className={cardClass}>
          {body}
        </Card>
      </Link>
    );
  }
  return (
    <Card size="sm" className={cardClass}>
      {body}
    </Card>
  );
}
