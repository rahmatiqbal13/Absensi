import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuditAksiBadge } from "./audit-aksi-badge";

describe("AuditAksiBadge", () => {
  it("labels known actions in Indonesian", () => {
    render(<AuditAksiBadge aksi="employee_deactivated" />);
    expect(screen.getByText("Karyawan Dinonaktifkan")).toBeInTheDocument();
    expect(screen.getByText("Karyawan Dinonaktifkan")).toHaveAttribute(
      "data-variant",
      "destructive",
    );
  });
  it("labels leave actions", () => {
    render(<AuditAksiBadge aksi="leave_approved" />);
    expect(screen.getByText("Cuti Disetujui")).toBeInTheDocument();
    expect(screen.getByText("Cuti Disetujui")).toHaveAttribute("data-variant", "success");
  });
  it("falls back to the raw value for an unknown action", () => {
    render(<AuditAksiBadge aksi="something_new" />);
    expect(screen.getByText("something_new")).toBeInTheDocument();
    expect(screen.getByText("something_new")).toHaveAttribute("data-variant", "neutral");
  });
});
