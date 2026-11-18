import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS, csvCell } from "@/lib/employees/import";

/** Template CSV for the bulk import (semicolon-separated, opens straight in Indonesian Excel). */
export function GET() {
  const body = "﻿" + [TEMPLATE_HEADERS.join(";"), TEMPLATE_EXAMPLE.map(csvCell).join(";")].join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="template-import-karyawan.csv"',
    },
  });
}
