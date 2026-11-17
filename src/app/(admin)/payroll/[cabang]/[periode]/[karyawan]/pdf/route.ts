import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { payslipPdfResponse } from "@/lib/payroll/payslip-pdf-response";
import { payrollPeriodId, payslipIdInPeriod } from "@/lib/routing/paths";

// @react-pdf/renderer needs Node APIs (fontkit, zlib).
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cabang: string; periode: string; karyawan: string }> },
) {
  const { cabang, periode, karyawan } = await params;
  const db = await createServerSupabaseClient();
  const viewer = await getCurrentEmployee(db);
  if (!viewer) return new Response("Silakan masuk terlebih dahulu.", { status: 401 });
  if (viewer.role !== "hr_admin" && viewer.role !== "super_admin") return new Response("Tidak diizinkan.", { status: 403 });

  const periodId = await payrollPeriodId(db, cabang, periode);
  const payslipId = periodId ? await payslipIdInPeriod(db, periodId, karyawan) : null;
  if (!payslipId) return new Response("Slip gaji tidak ditemukan.", { status: 404 });
  return payslipPdfResponse(db, viewer, payslipId);
}
