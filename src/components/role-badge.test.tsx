import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleBadge } from "./role-badge";

describe("RoleBadge", () => {
  it("renders an Indonesian label per role", () => {
    render(<RoleBadge role="karyawan" />);
    expect(screen.getByText("Karyawan")).toBeInTheDocument();
  });
  it("labels hr_admin and super_admin", () => {
    const { rerender } = render(<RoleBadge role="hr_admin" />);
    expect(screen.getByText("HR Admin")).toBeInTheDocument();
    rerender(<RoleBadge role="super_admin" />);
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
  });
  it("gives distinct classes to karyawan vs super_admin", () => {
    const { container: a } = render(<RoleBadge role="karyawan" />);
    const { container: b } = render(<RoleBadge role="super_admin" />);
    expect((a.firstChild as HTMLElement).className).not.toBe((b.firstChild as HTMLElement).className);
  });
});
