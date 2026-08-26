import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  it("renders sidebar nav links with accessible names", () => {
    render(<AdminShell><div>content</div></AdminShell>);
    for (const name of ["Dashboard", "Karyawan", "Cuti", "Laporan", "Pengaturan", "Payroll"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("renders the page content", () => {
    render(<AdminShell><div>konten admin</div></AdminShell>);
    expect(screen.getByText("konten admin")).toBeInTheDocument();
  });
});
