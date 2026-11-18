import type { SupabaseClient } from "@supabase/supabase-js";

// Readable URLs (migration 0043): employees and branches carry a unique `slug`
// derived from their name; a payroll period is addressed as cabang + "YYYY-MM".
// Pages still accept the old UUID links and redirect them to these paths.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

export function periodeSlug(bulan: number, tahun: number): string {
  return `${tahun}-${String(bulan).padStart(2, "0")}`;
}

export function parsePeriodeSlug(s: string): { bulan: number; tahun: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const bulan = Number(m[2]);
  if (bulan < 1 || bulan > 12) return null;
  return { bulan, tahun: Number(m[1]) };
}

type Period = { branchSlug: string; bulan: number; tahun: number };

export const paths = {
  karyawan: (slug: string) => `/karyawan/${slug}`,
  laporanKaryawan: (slug: string) => `/laporan/karyawan/${slug}`,
  payrollPeriod: (p: Period) => `/payroll/${p.branchSlug}/${periodeSlug(p.bulan, p.tahun)}`,
  payrollSlip: (p: Period, employeeSlug: string) => `${paths.payrollPeriod(p)}/${employeeSlug}`,
  payrollSlipPdf: (p: Period, employeeSlug: string) => `${paths.payrollSlip(p, employeeSlug)}/pdf`,
  slipGaji: (bulan: number, tahun: number) => `/slip-gaji/${periodeSlug(bulan, tahun)}`,
  slipGajiPdf: (bulan: number, tahun: number) => `/slip-gaji/${periodeSlug(bulan, tahun)}/pdf`,
};

/** Route patterns for revalidatePath(pattern, "page"). */
export const routePatterns = {
  karyawan: "/karyawan/[slug]",
  laporanKaryawan: "/laporan/karyawan/[slug]",
  payrollPeriod: "/payroll/[cabang]/[periode]",
};

/** Employee id for a slug (or a legacy UUID), or null. */
export async function employeeIdBySlug(
  db: SupabaseClient,
  slug: string,
): Promise<{ id: string; slug: string } | null> {
  const { data, error } = await db
    .from("employees")
    .select("id, slug")
    .eq(isUuid(slug) ? "id" : "slug", slug)
    .maybeSingle();
  if (error) console.error("employeeIdBySlug failed", error);
  return data ?? null;
}

/** Payroll period id for cabang slug + "YYYY-MM", or null. */
export async function payrollPeriodId(db: SupabaseClient, branchSlug: string, periode: string): Promise<string | null> {
  const p = parsePeriodeSlug(periode);
  if (!p) return null;
  // Two plain lookups rather than an embedded `branches!inner` filter: branches
  // is readable per column only (0031), and the embedded filter did not resolve
  // for signed-in users even though it did for the service role.
  const { data: branch, error: branchErr } = await db.from("branches").select("id").eq("slug", branchSlug).maybeSingle();
  if (branchErr) console.error("payrollPeriodId: branch lookup failed", branchErr);
  if (!branch) return null;
  const { data, error } = await db
    .from("payroll_periods")
    .select("id")
    .eq("branch_id", branch.id)
    .eq("bulan", p.bulan)
    .eq("tahun", p.tahun)
    .maybeSingle();
  if (error) console.error("payrollPeriodId: period lookup failed", error);
  return data?.id ?? null;
}

/** Path of a payroll period by id (for redirecting legacy UUID links). */
export async function payrollPeriodPathById(db: SupabaseClient, periodId: string): Promise<string | null> {
  const { data } = await db
    .from("payroll_periods")
    .select("bulan, tahun, branches(slug)")
    .eq("id", periodId)
    .maybeSingle();
  const branchSlug = (data?.branches as unknown as { slug: string } | null)?.slug;
  return data && branchSlug ? paths.payrollPeriod({ branchSlug, bulan: data.bulan, tahun: data.tahun }) : null;
}

/** Admin path of a payslip by id (for redirecting legacy UUID links). */
export async function payrollSlipPathById(db: SupabaseClient, payslipId: string): Promise<string | null> {
  const { data } = await db
    .from("payslips")
    .select("employees(slug), payroll_periods(bulan, tahun, branches(slug))")
    .eq("id", payslipId)
    .maybeSingle();
  const emp = data?.employees as unknown as { slug: string } | null;
  const period = data?.payroll_periods as unknown as { bulan: number; tahun: number; branches: { slug: string } | null } | null;
  if (!emp || !period?.branches) return null;
  return paths.payrollSlip({ branchSlug: period.branches.slug, bulan: period.bulan, tahun: period.tahun }, emp.slug);
}

/** Payslip id of one employee (by slug) inside a payroll period, or null. */
export async function payslipIdInPeriod(db: SupabaseClient, periodId: string, employeeSlug: string): Promise<string | null> {
  const employee = await employeeIdBySlug(db, employeeSlug);
  if (!employee) return null;
  const { data, error } = await db
    .from("payslips")
    .select("id")
    .eq("payroll_period_id", periodId)
    .eq("employee_id", employee.id)
    .maybeSingle();
  if (error) console.error("payslipIdInPeriod failed", error);
  return data?.id ?? null;
}

/**
 * An employee's own payslip for "YYYY-MM", or null. Moving branches mid-month
 * could leave two; the latest one wins.
 */
export async function ownPayslipId(db: SupabaseClient, employeeId: string, periode: string): Promise<string | null> {
  const p = parsePeriodeSlug(periode);
  if (!p) return null;
  const { data, error } = await db
    .from("payslips")
    .select("id, payroll_periods!inner(bulan, tahun)")
    .eq("employee_id", employeeId)
    .eq("payroll_periods.bulan", p.bulan)
    .eq("payroll_periods.tahun", p.tahun)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("ownPayslipId failed", error);
  return data?.id ?? null;
}

/** Employee path of their own payslip by id (for redirecting legacy UUID links). */
export async function slipGajiPathById(db: SupabaseClient, payslipId: string): Promise<string | null> {
  const { data } = await db.from("payslips").select("payroll_periods(bulan, tahun)").eq("id", payslipId).maybeSingle();
  const p = data?.payroll_periods as unknown as { bulan: number; tahun: number } | null;
  return p ? paths.slipGaji(p.bulan, p.tahun) : null;
}
