import { describe, it, expect } from "vitest";
import { resolveApprover } from "./approver";

describe("resolveApprover", () => {
  it("uses atasan_id for a regular karyawan with a valid atasan", () => {
    const result = resolveApprover({
      id: "employee-1",
      role: "karyawan",
      atasanId: "atasan-1",
      designatedApproverId: "super-admin-1",
    });
    expect(result).toEqual({ approverId: "atasan-1", isSelfRequest: false });
  });

  it("uses designated_approver_id when the employee is hr_admin", () => {
    const result = resolveApprover({
      id: "hr-1",
      role: "hr_admin",
      atasanId: "atasan-1",
      designatedApproverId: "super-admin-1",
    });
    expect(result).toEqual({ approverId: "super-admin-1", isSelfRequest: true });
  });

  it("uses designated_approver_id when the employee is super_admin", () => {
    const result = resolveApprover({
      id: "super-1",
      role: "super_admin",
      atasanId: null,
      designatedApproverId: "super-admin-2",
    });
    expect(result).toEqual({ approverId: "super-admin-2", isSelfRequest: true });
  });

  it("uses designated_approver_id when atasan_id is null", () => {
    const result = resolveApprover({
      id: "employee-2",
      role: "karyawan",
      atasanId: null,
      designatedApproverId: "hr-1",
    });
    expect(result).toEqual({ approverId: "hr-1", isSelfRequest: true });
  });

  it("uses designated_approver_id when atasan_id points to the employee itself", () => {
    const result = resolveApprover({
      id: "employee-3",
      role: "atasan",
      atasanId: "employee-3",
      designatedApproverId: "hr-1",
    });
    expect(result).toEqual({ approverId: "hr-1", isSelfRequest: true });
  });

  it("returns a null approverId when there is no atasan and no designated approver", () => {
    const result = resolveApprover({
      id: "employee-4",
      role: "karyawan",
      atasanId: null,
      designatedApproverId: null,
    });
    expect(result).toEqual({ approverId: null, isSelfRequest: true });
  });
});
