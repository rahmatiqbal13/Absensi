import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** ISO string or "HH:mm" -> "HH:mm". Returns "—" for a null/blank value. */
export function formatClockTime(value: string | null): string {
  if (!value) return "—";
  if (!value.includes("T")) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Small vertical timeline of today's clock events. Pure presentational, no
 * client hooks, so it can be imported straight into the client `ClockPanel`.
 */
export function TodayTimeline({
  jamMasuk,
  jamPulang,
}: {
  jamMasuk: string | null;
  jamPulang: string | null;
}) {
  const nodes = [
    { label: "Masuk", value: jamMasuk },
    { label: "Pulang", value: jamPulang },
  ];

  return (
    <ol className="w-full">
      {nodes.map((node, index) => {
        const done = Boolean(node.value);
        const isLast = index === nodes.length - 1;
        return (
          <li key={node.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background",
                )}
                aria-hidden="true"
              >
                {done && <CheckCircle2 className="size-3" />}
              </span>
              {!isLast && (
                <span className={cn("my-1 w-0.5 flex-1 min-h-6", done ? "bg-primary" : "bg-input")} />
              )}
            </div>
            <div className={cn("pb-4", isLast && "pb-0")}>
              <p className="text-sm font-medium text-foreground">{node.label}</p>
              <p className="text-sm text-muted-foreground">
                {done ? formatClockTime(node.value) : "—"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
