import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateRecapRange } from "@/lib/laporan/validate-range";
import { loadEmployeeDailyReport } from "@/lib/laporan/load-employee-daily";
import { jadwalLabel } from "@/lib/laporan/employee-daily";
import { employeeIdBySlug } from "@/lib/routing/paths";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { productLogoDataUrl } from "@/lib/branding/product-logo-data-url";
import { fetchLogoDataUrl } from "@/lib/branding/fetch-logo";
import { EmployeeDailyDocument, printedAt } from "@/components/employee-daily-pdf";

// @react-pdf/renderer needs Node APIs.
export const runtime = "nodejs";

/** One employee's day-by-day attendance as PDF. Same access rule as the page and CSV. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role === "karyawan") return new Response("Tidak diizinkan.", { status: 403 });

  const found = await employeeIdBySlug(db, slug);
  if (!found) return new Response("Karyawan tidak ditemukan.", { status: 404 });

  const url = new URL(request.url);
  const range = validateRecapRange(url.searchParams.get("dari"), url.searchParams.get("sampai"));
  if (!range.ok) return new Response(range.error, { status: 400 });

  const res = await loadEmployeeDailyReport(db, me, found.id, range.from, range.to);
  if (!res.ok) return new Response(res.error, { status: res.status });
  const { employee, schedule, rows } = res.report;

  const { namaInstansi, logoUrl, alamat } = await getAppSettings();
  const orgLogoUrl = (await fetchLogoDataUrl(logoUrl)) ?? (await productLogoDataUrl());

  try {
    const buffer = await renderToBuffer(
      <EmployeeDailyDocument
        org={{ nama: namaInstansi, alamat, logoUrl: orgLogoUrl }}
        from={range.from}
        to={range.to}
        dicetak={printedAt()}
        data={{
          nama: employee.nama,
          keterangan: [employee.jabatan, employee.departemen, employee.cabang].filter(Boolean).join(" · ") || null,
          jadwal: schedule ? jadwalLabel(schedule) : null,
          rows,
        }}
      />,
    );
    const file = found.slug.replace(/[^a-z0-9-]/gi, "") || "karyawan";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="kehadiran-${file}-${range.from}_${range.to}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("laporan karyawan pdf render failed", err);
    return new Response("Gagal membuat PDF laporan.", { status: 500 });
  }
}
