import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { loadRecap } from "@/lib/laporan/load-recap";
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

  const { data: departments } = await db
    .from("departments")
    .select("id, nama, branch_id")
    .order("nama");
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
  // against the loaded list is still cleaner.
  const deptIds = new Set(deptList.map((d) => d.id));
  const dept = sp.dept && deptIds.has(sp.dept) ? sp.dept : "";

  const today = toJakartaDateOnly(new Date());
  const dari = sp.dari || `${today.slice(0, 7)}-01`;
  const sampai = sp.sampai || today;

  const queryString = new URLSearchParams({
    cabang: defaultCabang,
    ...(dept ? { dept } : {}),
    dari,
    sampai,
  }).toString();

  const recap = defaultCabang
    ? await loadRecap(db, {
        branchId: defaultCabang,
        departmentId: dept || null,
        from: dari,
        to: sampai,
      })
    : ({ ok: false, error: "Belum ada cabang." } as const);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Laporan Kehadiran</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Rekap per karyawan untuk rentang tanggal terpilih.
          </p>
        </div>
        {recap.ok && (
          <div className="flex gap-2">
            <a
              href={`/laporan/csv?${queryString}`}
              className="min-h-10 rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800"
            >
              Unduh CSV
            </a>
            <a
              href={`/laporan/pdf?${queryString}`}
              className="min-h-10 rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800"
            >
              Unduh PDF
            </a>
          </div>
        )}
      </div>

      <LaporanFilters
        branches={branchList}
        departments={deptList}
        defaults={{ cabang: defaultCabang, dept, dari, sampai }}
      />

      {!recap.ok && <p className="text-sm text-red-600">{recap.error}</p>}
      {recap.ok && recap.rows.length === 0 && (
        <p className="text-sm text-neutral-500">
          Tidak ada karyawan aktif untuk filter ini.
        </p>
      )}
      {recap.ok && recap.rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Hadir</th>
                <th className="px-4 py-2 font-medium">Terlambat</th>
                <th className="px-4 py-2 font-medium">Pulang Cepat</th>
                <th className="px-4 py-2 font-medium">Di Luar Lokasi</th>
                <th className="px-4 py-2 font-medium">Alpa</th>
                <th className="px-4 py-2 font-medium">Cuti</th>
                <th className="px-4 py-2 font-medium">Menit Terlambat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {recap.rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-2 font-medium text-neutral-900">{r.nama}</td>
                  <td className="px-4 py-2">{r.hadir}</td>
                  <td className="px-4 py-2">{r.terlambat}</td>
                  <td className="px-4 py-2">{r.pulangCepat}</td>
                  <td className="px-4 py-2">{r.diLuarLokasi}</td>
                  <td className="px-4 py-2 text-red-600">{r.alpa}</td>
                  <td className="px-4 py-2">{r.cuti}</td>
                  <td className="px-4 py-2">{r.totalMenitTerlambat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
