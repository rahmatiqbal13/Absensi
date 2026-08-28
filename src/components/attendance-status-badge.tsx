import { CheckCircle2, Clock, LogOut, MapPin, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AttendanceStatus } from "@/lib/attendance/status";

const CONFIG: Record<
  AttendanceStatus,
  {
    label: string;
    variant: "success" | "warning" | "info" | "destructive";
    Icon: typeof Clock;
  }
> = {
  tepat_waktu: { label: "Tepat Waktu", variant: "success", Icon: CheckCircle2 },
  terlambat: { label: "Terlambat", variant: "warning", Icon: Clock },
  pulang_cepat: { label: "Pulang Cepat", variant: "warning", Icon: LogOut },
  alpa: { label: "Alpa", variant: "destructive", Icon: XCircle },
  di_luar_lokasi: { label: "Di Luar Lokasi", variant: "info", Icon: MapPin },
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const { label, variant, Icon } = CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
