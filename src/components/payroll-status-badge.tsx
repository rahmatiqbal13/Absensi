import { Lock, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type PayrollStatus = "draft" | "final";

const CONFIG: Record<
  PayrollStatus,
  { label: string; variant: "neutral" | "success"; Icon: typeof Lock }
> = {
  draft: { label: "Draft", variant: "neutral", Icon: PencilLine },
  final: { label: "Final", variant: "success", Icon: Lock },
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
