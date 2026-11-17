import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentEmployee } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { fetchLogoDataUrl } from "@/lib/branding/fetch-logo";
import { loadPayslipDetail } from "@/lib/payroll/payslip-detail";
import { payslipFileName, attachmentHeader } from "@/lib/payroll/payslip-filename";
import { PayslipDocument } from "@/components/payslip-document";

/**
 * The payslip PDF download, shared by the employee route (/slip-gaji/<YYYY-MM>/pdf)
 * and the HR route (/payroll/<cabang>/<YYYY-MM>/<karyawan>/pdf). Access is
 * checked by loadPayslipDetail (own slip, or HR).
 */
export async function payslipPdfResponse(
  db: SupabaseClient,
  viewer: CurrentEmployee,
  payslipId: string,
): Promise<Response> {
  const res = await loadPayslipDetail(db, viewer, payslipId);
  if (!res.ok) return new Response(res.error, { status: res.status });

  const settings = await getAppSettings();
  const logoUrl = await fetchLogoDataUrl(settings.logoUrl);
  const printedAt = new Date();

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(
      <PayslipDocument
        slip={res.slip}
        printedAt={printedAt}
        org={{
          nama: settings.namaInstansi,
          alamat: settings.alamat,
          telepon: settings.telepon,
          email: settings.email,
          logoUrl,
          aksen: settings.warnaAksen,
        }}
      />,
    );
  } catch (err) {
    console.error("payslip pdf render failed", err);
    return new Response("Gagal membuat slip gaji.", { status: 500 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      // Employee name + download moment (WIB), e.g. Slip-Gaji_Budi-Santoso_2026-11-17_09-52-07.pdf
      "Content-Disposition": attachmentHeader(payslipFileName(res.slip.karyawan.nama, printedAt)),
      "Cache-Control": "private, no-store",
    },
  });
}
