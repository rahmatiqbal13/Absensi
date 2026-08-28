import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type LeaveStatus = "pending" | "approved" | "rejected";

const CONFIG: Record<
  LeaveStatus,
  { label: string; variant: "warning" | "success" | "destructive"; Icon: typeof Clock }
> = {
  pending: { label: "Menunggu", variant: "warning", Icon: Clock },
  approved: { label: "Disetujui", variant: "success", Icon: CheckCircle2 },
  rejected: { label: "Ditolak", variant: "destructive", Icon: XCircle },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { label, variant, Icon } = CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
