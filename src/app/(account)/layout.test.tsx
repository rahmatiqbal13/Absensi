import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getCurrentEmployee = vi.fn();
const redirect = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: () => getCurrentEmployee() }));
vi.mock("@/lib/profile/photo", () => ({ signProfilePhotoUrl: async () => null }));
vi.mock("next/navigation", () => ({
  // real redirect() throws NEXT_REDIRECT to halt rendering — mirror that
  redirect: (u: string) => {
    redirect(u);
    throw new Error("NEXT_REDIRECT");
  },
  usePathname: () => "/profil",
}));
// BrandMark / AppFooter are async server components (they fetch app settings);
// stub them so the shell-selection logic is what this test exercises.
vi.mock("@/components/brand-mark", () => ({ BrandMark: () => <span>brand</span> }));
vi.mock("@/components/app-footer", () => ({ AppFooter: () => <footer>footer</footer> }));

import AccountLayout from "./layout";

describe("(account) layout", () => {
  it("renders the AdminShell for an hr_admin", async () => {
    getCurrentEmployee.mockResolvedValue({ id: "u1", nama: "Budi", email: "b@x.id", role: "hr_admin", branchId: "b1", fotoPath: null });
    render(await AccountLayout({ children: <p>profil</p> }));
    // AdminShell renders the admin primary nav (Dashboard link)
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByText("profil")).toBeInTheDocument();
  });

  it("renders the EmployeeShell for a karyawan", async () => {
    getCurrentEmployee.mockResolvedValue({ id: "u2", nama: "Ana", email: "a@x.id", role: "karyawan", branchId: "b1", fotoPath: null });
    render(await AccountLayout({ children: <p>profil</p> }));
    expect(screen.getByRole("link", { name: "Absen" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });

  it("redirects to /login when there is no session", async () => {
    getCurrentEmployee.mockResolvedValue(null);
    await expect(AccountLayout({ children: <p>x</p> })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
