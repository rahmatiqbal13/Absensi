import { BadgeCheck, Lock, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** "dibayar" is a finalized period with a payment date (see migration 0045). */
export type PayrollStatus = "draft" | "final" | "dibayar";

export function payrollDisplayStatus(status: string, dibayarPada: string | null | undefined): PayrollStatus {
  if (status === "final" && dibayarPada) return "dibayar";
  return status === "final" ? "final" : "draft";
}

const CONFIG: Record<
  PayrollStatus,
  { label: string; variant: "neutral" | "info" | "success"; Icon: typeof Lock }
> = {
  draft: { label: "Draft", variant: "neutral", Icon: PencilLine },
  final: { label: "Final", variant: "info", Icon: Lock },
  dibayar: { label: "Dibayar", variant: "success", Icon: BadgeCheck },
};

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  const { label, variant, Icon } = CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
