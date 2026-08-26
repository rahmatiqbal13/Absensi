export type Role = "karyawan" | "atasan" | "hr_admin" | "super_admin";
export type RouteAccessResult = "allow" | "redirect-login" | "redirect-employee-home";

const ADMIN_PATH_PREFIXES = [
  "/dashboard",
  "/karyawan",
  "/persetujuan-cuti",
  "/laporan",
  "/pengaturan",
  "/payroll",
];
const PUBLIC_PATHS = ["/login"];

export function resolveRouteAccess(pathname: string, role: Role | null): RouteAccessResult {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "allow";
  if (!role) return "redirect-login";

  const isAdminPath = ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminPath && role === "karyawan") return "redirect-employee-home";

  return "allow";
}
