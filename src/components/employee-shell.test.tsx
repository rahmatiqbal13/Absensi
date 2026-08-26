import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeShell } from "./employee-shell";

describe("EmployeeShell", () => {
  it("renders bottom nav links with accessible names", () => {
    render(<EmployeeShell><div>content</div></EmployeeShell>);
    for (const name of ["Absen", "Cuti", "Riwayat", "Profil"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("gives nav links the minimum touch target class", () => {
    render(<EmployeeShell><div>content</div></EmployeeShell>);
    const absenLink = screen.getByRole("link", { name: "Absen" });
    expect(absenLink.className).toContain("min-h-11");
    expect(absenLink.className).toContain("min-w-11");
  });

  it("renders the page content", () => {
    render(<EmployeeShell><div>konten halaman</div></EmployeeShell>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });
});
