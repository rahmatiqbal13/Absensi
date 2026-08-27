import type { Role } from "@/lib/auth/route-access";

export type ApproverInput = {
  id: string;
  role: Role;
  atasanId: string | null;
  designatedApproverId: string | null;
};

export type ApproverResolution = {
  approverId: string | null;
  isSelfRequest: boolean;
};

export function resolveApprover(employee: ApproverInput): ApproverResolution {
  const needsDesignatedApprover =
    employee.role === "hr_admin" ||
    employee.role === "super_admin" ||
    !employee.atasanId ||
    employee.atasanId === employee.id;

  if (needsDesignatedApprover) {
    return { approverId: employee.designatedApproverId, isSelfRequest: true };
  }

  return { approverId: employee.atasanId, isSelfRequest: false };
}
