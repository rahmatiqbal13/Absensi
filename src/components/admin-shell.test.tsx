import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  it("renders sidebar nav links with accessible names", () => {
    render(<AdminShell role="hr_admin"><div>content</div></AdminShell>);
    for (const name of ["Dashboard", "Karyawan", "Cuti", "Laporan", "Pengaturan", "Payroll"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("renders the page content", () => {
    render(<AdminShell role="hr_admin"><div>konten admin</div></AdminShell>);
    expect(screen.getByText("konten admin")).toBeInTheDocument();
  });

  it("hides the Payroll nav item from a non-hr-admin role", () => {
    render(<AdminShell role="atasan"><div>content</div></AdminShell>);
    expect(screen.queryByRole("link", { name: "Payroll" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("shows the Payroll nav item to super_admin", () => {
    render(<AdminShell role="super_admin"><div>content</div></AdminShell>);
    expect(screen.getByRole("link", { name: "Payroll" })).toBeInTheDocument();
  });
});
