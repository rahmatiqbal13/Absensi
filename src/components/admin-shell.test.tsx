import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/app/(auth)/actions");
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  // Force a non-empty alt so jsdom exposes the node with role "img"
  // (the real component renders a decorative alt=""). Test-only.
  AvatarImage: (p: Record<string, unknown>) => <img {...p} alt="Foto profil" />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { AdminShell } from "./admin-shell";
import * as actionsModule from "@/app/(auth)/actions";

const emp = (role: "atasan" | "hr_admin" | "super_admin") => ({
  id: "u1",
  nama: "Budi Santoso",
  email: "budi@x.id",
  role,
  branchId: "b1",
  fotoPath: null,
});

const renderShell = (
  role: "atasan" | "hr_admin" | "super_admin",
  children: React.ReactNode = <div>content</div>,
) =>
  render(
    <AdminShell employee={emp(role)} brand={<div>Brand</div>} footer={<footer>footer</footer>}>
      {children}
    </AdminShell>,
  );

describe("AdminShell", () => {
  it("renders the primary nav for super_admin", () => {
    renderShell("super_admin");
    for (const name of ["Dashboard", "Karyawan", "Cuti", "Laporan", "Payroll", "Pengaturan"]) {
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    }
  });

  it("hides Payroll + Karyawan from atasan", () => {
    renderShell("atasan");
    expect(screen.queryByRole("link", { name: "Payroll" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Karyawan" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
  });

  it("renders page content and the footer", () => {
    renderShell("hr_admin", <div>konten admin</div>);
    expect(screen.getByText("konten admin")).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();
  });

  it("shows the user name + role and a working Keluar item", async () => {
    const signOutMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(actionsModule.signOut).mockImplementation(signOutMock);

    const user = userEvent.setup();
    renderShell("hr_admin");
    await user.click(screen.getByRole("button", { name: /budi santoso/i }));
    const item = await screen.findByRole("menuitem", { name: /keluar/i });
    expect(item).toBeInTheDocument();
    await user.click(item);
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("links to /profil from the user menu", async () => {
    const user = userEvent.setup();
    renderShell("hr_admin");
    await user.click(screen.getByRole("button", { name: /menu pengguna/i }));
    expect(screen.getByRole("menuitem", { name: "Profil" })).toHaveAttribute("href", "/profil");
  });

  it("shows the profile photo in the topbar when avatarUrl is set", () => {
    render(
      <AdminShell employee={emp("hr_admin")} avatarUrl="https://s/pic" brand={<div>Brand</div>} footer={<footer>footer</footer>}>
        <div>content</div>
      </AdminShell>,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://s/pic");
  });

  it("shows the initials fallback when avatarUrl is absent", () => {
    renderShell("hr_admin");
    expect(screen.getByText("BS")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("opens the mobile nav sheet", async () => {
    const user = userEvent.setup();
    renderShell("hr_admin");
    await user.click(screen.getByRole("button", { name: /buka menu/i }));
    // the sheet is a modal dialog — Radix aria-hides the rest of the app, so the
    // desktop <aside> nav drops out of the a11y tree. Assert the second copy of
    // the nav is inside the opened dialog.
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Payroll" })).toBeInTheDocument();
  });
});
