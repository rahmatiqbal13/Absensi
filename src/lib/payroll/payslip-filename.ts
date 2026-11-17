/**
 * Download name for a payslip PDF: employee name + the moment of download in
 * Jakarta time, e.g. "Slip-Gaji_Budi-Santoso_2026-11-17_09-52-07.pdf".
 */
export function payslipFileName(nama: string, now: Date = new Date()): string {
  const slug =
    nama
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "Karyawan";

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const stamp = `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
  return `Slip-Gaji_${slug}_${stamp}.pdf`;
}

/** Content-Disposition with an ASCII name (the slug already is). */
export function attachmentHeader(fileName: string): string {
  return `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
