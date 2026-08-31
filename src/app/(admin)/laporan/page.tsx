import { redirect } from "next/navigation";
import { Download, FileBarChart } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { loadRecap } from "@/lib/laporan/load-recap";
import { validateRecapRange } from "@/lib/laporan/validate-range";
import { PageHeader } from "@/components/page-header";
import { ResponsiveTable } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import { LaporanFilters } from "./laporan-filters";

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ cabang?: string; dept?: string; dari?: string; sampai?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  // `/laporan` is in ADMIN_PATH_PREFIXES (src/lib/auth/route-access.ts) so the
  // middleware already redirects `karyawan` to employee-home; the dashboard
  // page uses the same minimal `!employee` guard. No role check here.

  const { data: branches, error: branchErr } = await db
    .from("branches")
    .select("id, nama")
    .order("nama");
  if (branchErr) console.error("laporan: branches query failed", branchErr);
  const branchList = branches ?? [];

  const { data: departments, error: deptErr } = await db
    .from("departments")
    .select("id, nama, branch_id")
    .order("nama");
  if (deptErr) console.error("laporan: departments query failed", deptErr);
  const deptList = (departments ?? []).map((d) => ({
    id: d.id,
    nama: d.nama,
    branchId: d.branch_id,
  }));

  // Guard the `cabang` param before it reaches loadRecap: its holiday query
  // interpolates the branch id into a PostgREST `.or(...)` string, so only a
  // value that is actually one of the loaded branch ids may be passed through.
  const branchIds = new Set(branchList.map((b) => b.id));
  const defaultCabang =
    sp.cabang && branchIds.has(sp.cabang) ? sp.cabang : branchList[0]?.id ?? "";

  // `dept` is applied via `.eq()` (not string interpolation) but a Set check
  // against the loaded list is still cleaner. Only accept a dept that belongs
  // to the selected branch.
  const deptIds = new Set(
    deptList.filter((d) => d.branchId === defaultCabang).map((d) => d.id),
  );
  const dept = sp.dept && deptIds.has(sp.dept) ? sp.dept : "";

  const today = toJakartaDateOnly(new Date());
  const dari = sp.dari || `${today.slice(0, 7)}-01`;
  const sampai = sp.sampai || today;

  const range = validateRecapRange(dari, sampai);

  const queryString = new URLSearchParams({
    cabang: defaultCabang,
    ...(dept ? { dept } : {}),
    dari: range.ok ? range.from : dari,
    sampai: range.ok ? range.to : sampai,
  }).toString();

  const recap = !range.ok
    ? ({ ok: false, error: range.error } as const)
    : defaultCabang
      ? await loadRecap(db, {
          branchId: defaultCabang,
          departmentId: dept || null,
          from: range.from,
          to: range.to,
        })
      : ({ ok: false, error: "Belum ada cabang." } as const);

  const totals = recap.ok
    ? recap.rows.reduce(
        (acc, r) => ({
          hadir: acc.hadir + r.hadir,
          terlambat: acc.terlambat + r.terlambat,
          pulangCepat: acc.pulangCepat + r.pulangCepat,
          diLuarLokasi: acc.diLuarLokasi + r.diLuarLokasi,
          alpa: acc.alpa + r.alpa,
          cuti: acc.cuti + r.cuti,
          menit: acc.menit + r.totalMenitTerlambat,
        }),
        { hadir: 0, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0, alpa: 0, cuti: 0, menit: 0 },
      )
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Kehadiran"
        description="Rekap per karyawan untuk rentang tanggal terpilih."
        actions={
          recap.ok ? (
            <>
              <Button asChild variant="outline" size="sm">
                <a href={`/laporan/csv?${queryString}`}>
                  <Download className="size-4" /> Unduh CSV
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/laporan/pdf?${queryString}`}>
                  <Download className="size-4" /> Unduh PDF
                </a>
              </Button>
            </>
          ) : undefined
        }
      />

      <LaporanFilters
        branches={branchList}
        departments={deptList}
        defaults={{ cabang: defaultCabang, dept, dari, sampai }}
      />

      {!recap.ok && (
        <Alert variant="destructive">
          <AlertDescription>{recap.error}</AlertDescription>
        </Alert>
      )}

      {recap.ok && (
        <ResponsiveTable
          caption="Rekap kehadiran per karyawan"
          columns={[
            { key: "nama", header: "Nama", cell: (r) => r.nama },
            { key: "hadir", header: "Hadir", align: "right", cell: (r) => r.hadir, mobileLabel: "Hadir" },
            { key: "terlambat", header: "Terlambat", align: "right", cell: (r) => r.terlambat, mobileLabel: "Terlambat" },
            { key: "pc", header: "Pulang Cepat", align: "right", cell: (r) => r.pulangCepat, mobileLabel: "Pulang Cepat" },
            { key: "dll", header: "Di Luar Lokasi", align: "right", cell: (r) => r.diLuarLokasi, mobileLabel: "Di Luar Lokasi" },
            {
              key: "alpa",
              header: "Alpa",
              align: "right",
              mobileLabel: "Alpa",
              cell: (r) => <span className={r.alpa > 0 ? "text-destructive" : undefined}>{r.alpa}</span>,
            },
            { key: "cuti", header: "Cuti", align: "right", cell: (r) => r.cuti, mobileLabel: "Cuti" },
            { key: "menit", header: "Menit Terlambat", align: "right", cell: (r) => r.totalMenitTerlambat, mobileLabel: "Menit Terlambat" },
          ]}
          rows={recap.rows}
          rowKey={(r) => r.employeeId}
          emptyState={<EmptyState icon={FileBarChart} message="Tidak ada karyawan aktif untuk filter ini." />}
          footer={
            totals ? (
              <>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right tabular-nums">{totals.hadir}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.terlambat}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.pulangCepat}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.diLuarLokasi}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.alpa}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.cuti}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.menit}</TableCell>
              </>
            ) : undefined
          }
          footerMobile={
            totals ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {(
                      [
                        ["Hadir", totals.hadir],
                        ["Terlambat", totals.terlambat],
                        ["Pulang Cepat", totals.pulangCepat],
                        ["Di Luar Lokasi", totals.diLuarLokasi],
                        ["Alpa", totals.alpa],
                        ["Cuti", totals.cuti],
                        ["Menit Terlambat", totals.menit],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
