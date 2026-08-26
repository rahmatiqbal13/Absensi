import { describe, it, expect } from "vitest";
import { resolveRouteAccess } from "./route-access";

describe("resolveRouteAccess", () => {
  it("redirects to login when there is no role and the path is protected", () => {
    expect(resolveRouteAccess("/absen", null)).toBe("redirect-login");
    expect(resolveRouteAccess("/dashboard", null)).toBe("redirect-login");
  });

  it("allows /login itself regardless of role", () => {
    expect(resolveRouteAccess("/login", null)).toBe("allow");
  });

  it("allows any authenticated role on employee routes", () => {
    for (const role of ["karyawan", "atasan", "hr_admin", "super_admin"] as const) {
      expect(resolveRouteAccess("/absen", role)).toBe("allow");
      expect(resolveRouteAccess("/cuti", role)).toBe("allow");
    }
  });

  it("blocks karyawan from admin routes and sends them to their employee home", () => {
    expect(resolveRouteAccess("/dashboard", "karyawan")).toBe("redirect-employee-home");
    expect(resolveRouteAccess("/karyawan", "karyawan")).toBe("redirect-employee-home");
  });

  it("allows atasan, hr_admin, and super_admin on admin routes", () => {
    for (const role of ["atasan", "hr_admin", "super_admin"] as const) {
      expect(resolveRouteAccess("/dashboard", role)).toBe("allow");
    }
  });
});
