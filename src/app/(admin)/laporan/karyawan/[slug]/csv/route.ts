import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateRecapRange } from "@/lib/laporan/validate-range";
import { loadEmployeeDailyReport } from "@/lib/laporan/load-employee-daily";
import { employeeDailyToCsv } from "@/lib/laporan/employee-daily";
import { employeeIdBySlug } from "@/lib/routing/paths";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: employeeSlug } = await params;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role === "karyawan") return new Response("Tidak diizinkan.", { status: 403 });

  const found = await employeeIdBySlug(db, employeeSlug);
  if (!found) return new Response("Karyawan tidak ditemukan.", { status: 404 });
  const id = found.id;

  const url = new URL(request.url);
  const range = validateRecapRange(url.searchParams.get("dari"), url.searchParams.get("sampai"));
  if (!range.ok) return new Response(range.error, { status: 400 });

  const res = await loadEmployeeDailyReport(db, me, id, range.from, range.to);
  if (!res.ok) return new Response(res.error, { status: res.status });

  const slug = res.report.employee.nama.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "karyawan";
  return new Response(employeeDailyToCsv(res.report.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kehadiran-${slug}-${range.from}_${range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
