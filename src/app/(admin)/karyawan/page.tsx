import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { RoleBadge } from "@/components/role-badge";
import type { Role } from "@/lib/auth/route-access";
import { EmployeeFilters } from "./employee-filters";

export default async function KaryawanPage({
  searchParams,
}: {
  searchParams: Promise<{ cabang?: string; role?: string; status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const rawStatus = sp.status ?? "aktif";
  const status = rawStatus === "semua" ? null : rawStatus;

  const { data: branches, error: branchesError } = await db
    .from("branches")
    .select("id, nama")
    .order("nama");
  if (branchesError) console.error("Gagal memuat daftar cabang:", branchesError);

  let query = db
    .from("employees")
    .select("id, nama, jabatan, role, status, branches(nama)")
    .order("nama");
  if (sp.cabang) query = query.eq("branch_id", sp.cabang);
  if (sp.role) query = query.eq("role", sp.role);
  if (status) query = query.eq("status", status);
  if (sp.q) query = query.ilike("nama", `%${sp.q}%`);

  const { data: rows, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Karyawan</h1>
          <p className="mt-1 text-sm text-neutral-500">Kelola data karyawan dan onboarding.</p>
        </div>
        <Link
          href="/karyawan/baru"
          className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Tambah Karyawan
        </Link>
      </div>

      <EmployeeFilters
        branches={branches ?? []}
        defaults={{ cabang: sp.cabang, role: sp.role, status: rawStatus, q: sp.q ?? "" }}
      />

      {error && <p className="text-sm text-red-600">Gagal memuat daftar karyawan.</p>}
      {!error && (!rows || rows.length === 0) && (
        <p className="text-sm text-neutral-500">Tidak ada karyawan yang cocok dengan filter.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Jabatan</th>
                <th className="px-4 py-2 font-medium">Cabang</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link
                      href={`/karyawan/${r.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {r.nama}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.jabatan}</td>
                  <td className="px-4 py-2">
                    {(r.branches as unknown as { nama: string } | null)?.nama ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <RoleBadge role={r.role as Role} />
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        r.status === "aktif"
                          ? "bg-green-50 text-green-700"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {r.status === "aktif" ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
