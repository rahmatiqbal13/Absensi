import { Crown, ShieldCheck, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/auth/route-access";

const CONFIG: Record<
  Role,
  { label: string; variant: "default" | "info" | "secondary" | "neutral"; Icon: typeof User }
> = {
  karyawan: { label: "Karyawan", variant: "neutral", Icon: User },
  atasan: { label: "Atasan", variant: "secondary", Icon: Users },
  hr_admin: { label: "HR Admin", variant: "info", Icon: ShieldCheck },
  super_admin: { label: "Super Admin", variant: "default", Icon: Crown },
};

export function RoleBadge({ role }: { role: Role }) {
  const { label, variant, Icon } = CONFIG[role];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
