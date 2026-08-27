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

  it("blocks karyawan from the admin leave-approval route and allows other roles", () => {
    expect(resolveRouteAccess("/persetujuan-cuti", "karyawan")).toBe("redirect-employee-home");
    for (const role of ["atasan", "hr_admin", "super_admin"] as const) {
      expect(resolveRouteAccess("/persetujuan-cuti", role)).toBe("allow");
    }
  });

  it("does not treat /login-audit as the public /login path", () => {
    expect(resolveRouteAccess("/login-audit", null)).not.toBe("allow");
    expect(resolveRouteAccess("/login-audit", null)).toBe("redirect-login");
  });
});

describe("resolveRouteAccess — hr-admin-only paths", () => {
  it("lets hr_admin and super_admin into /payroll", () => {
    expect(resolveRouteAccess("/payroll", "hr_admin")).toBe("allow");
    expect(resolveRouteAccess("/payroll/abc", "super_admin")).toBe("allow");
  });

  it("redirects an atasan away from /payroll to the admin home", () => {
    expect(resolveRouteAccess("/payroll", "atasan")).toBe("redirect-admin-home");
    expect(resolveRouteAccess("/payroll/abc", "atasan")).toBe("redirect-admin-home");
  });

  it("still redirects a karyawan to the employee home for /payroll", () => {
    expect(resolveRouteAccess("/payroll", "karyawan")).toBe("redirect-employee-home");
  });

  it("does not affect other admin paths for atasan", () => {
    expect(resolveRouteAccess("/dashboard", "atasan")).toBe("allow");
    expect(resolveRouteAccess("/persetujuan-cuti", "atasan")).toBe("allow");
  });
});
