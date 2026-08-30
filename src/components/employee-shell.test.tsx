import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/absen" }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button>tema</button> }));

import { EmployeeShell } from "./employee-shell";

const renderShell = (children: React.ReactNode = <div>content</div>) =>
  render(
    <EmployeeShell brand={<div>Brand</div>} footer={<footer>footer</footer>}>
      {children}
    </EmployeeShell>,
  );

describe("EmployeeShell", () => {
  it("renders exactly the four bottom-nav items", () => {
    renderShell();
    for (const name of ["Absen", "Cuti", "Riwayat", "Slip Gaji"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Profil" })).not.toBeInTheDocument();
  });

  it("marks the active item with the primary colour", () => {
    renderShell();
    expect(screen.getByRole("link", { name: "Absen" }).className).toContain("text-primary");
  });

  it("gives each nav item a ≥44px touch target", () => {
    renderShell();
    expect(screen.getByRole("link", { name: "Cuti" }).className).toMatch(/min-h-1[1-4]/);
  });

  it("renders the header brand + theme toggle, the content, and the footer", () => {
    renderShell(<div>konten halaman</div>);
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "tema" })).toBeInTheDocument();
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();
  });
});
