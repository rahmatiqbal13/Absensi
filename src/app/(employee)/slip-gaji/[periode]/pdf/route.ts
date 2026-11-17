import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { payslipPdfResponse } from "@/lib/payroll/payslip-pdf-response";
import { isUuid, ownPayslipId } from "@/lib/routing/paths";

// @react-pdf/renderer needs Node APIs (fontkit, zlib).
export const runtime = "nodejs";

/** The signed-in employee's own payslip PDF for /slip-gaji/<YYYY-MM>/pdf. */
export async function GET(_request: Request, { params }: { params: Promise<{ periode: string }> }) {
  const { periode } = await params;
  const db = await createServerSupabaseClient();
  const viewer = await getCurrentEmployee(db);
  if (!viewer) return new Response("Silakan masuk terlebih dahulu.", { status: 401 });

  // Legacy /slip-gaji/<payslip uuid>/pdf links still work (access re-checked inside).
  const payslipId = isUuid(periode) ? periode : await ownPayslipId(db, viewer.id, periode);
  if (!payslipId) return new Response("Slip gaji tidak ditemukan.", { status: 404 });
  return payslipPdfResponse(db, viewer, payslipId);
}
