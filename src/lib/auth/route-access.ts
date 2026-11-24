export type Role = "karyawan" | "atasan" | "hr_admin" | "super_admin";
export type RouteAccessResult =
  | "allow"
  | "redirect-login"
  | "redirect-employee-home"
  | "redirect-admin-home";

const ADMIN_PATH_PREFIXES = [
  "/dashboard",
  "/karyawan",
  "/persetujuan-cuti",
  "/persetujuan-koreksi",
  "/laporan",
  "/pengaturan",
  "/payroll",
];
// Admin paths that additionally exclude the `atasan` role — HR-admin business,
// not team-lead reporting (spec §1: /payroll is hr_admin/super_admin only).
const HR_ADMIN_PATH_PREFIXES = ["/payroll", "/karyawan"];
// `/kiosk/<secret-key>` is a login-less branch entrance screen (QR attendance).
// `/api/cron/*` is called by the scheduler and authenticates with CRON_SECRET;
// `/api/mesin/*` by the office attendance-machine bridge, with MESIN_ABSENSI_TOKEN.
const PUBLIC_PATHS = ["/login", "/lupa-password", "/set-password", "/kiosk", "/api/cron", "/api/mesin"];

export function resolveRouteAccess(pathname: string, role: Role | null): RouteAccessResult {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "allow";
  if (!role) return "redirect-login";

  const isAdminPath = ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminPath && role === "karyawan") return "redirect-employee-home";

  const isHrAdminPath = HR_ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  if (isHrAdminPath && role === "atasan") return "redirect-admin-home";

  return "allow";
}

export function homePathForRole(role: Role): "/absen" | "/dashboard" {
  return role === "karyawan" ? "/absen" : "/dashboard";
}
