import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { AuditAksiBadge } from "@/components/audit-aksi-badge";
import { AuditFilters } from "./audit-filters";

const fmt = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string; target?: string; aksi?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: employees, error: employeesError } = await db
    .from("employees")
    .select("id, nama")
    .order("nama");
  if (employeesError) console.error("audit: gagal memuat daftar karyawan", employeesError);

  let q = db
    .from("audit_logs")
    .select(
      "id, waktu, aksi, detail, is_self_action, actor:employees!audit_logs_actor_id_fkey(nama), target:employees!audit_logs_target_employee_id_fkey(nama)",
    )
    .order("waktu", { ascending: false })
    .limit(100);
  if (sp.dari) q = q.gte("waktu", `${sp.dari}T00:00:00+07:00`);
  if (sp.sampai) {
    const end = new Date(`${sp.sampai}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt("waktu", `${end.toISOString().slice(0, 10)}T00:00:00+07:00`);
  }
  if (sp.target) q = q.eq("target_employee_id", sp.target);
  if (sp.aksi) q = q.eq("aksi", sp.aksi);

  const { data: rows, error } = await q;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Log Audit</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Riwayat perubahan data karyawan dan persetujuan cuti.
        </p>
      </div>

      <AuditFilters employees={employees ?? []} defaults={sp} />

      {error && <p className="text-sm text-red-600">Gagal memuat log audit.</p>}
      {!error && (!rows || rows.length === 0) && (
        <p className="text-sm text-neutral-500">Belum ada catatan audit.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Waktu</th>
                <th className="px-4 py-2 font-medium">Aksi</th>
                <th className="px-4 py-2 font-medium">Aktor</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {fmt.format(new Date(r.waktu))}
                  </td>
                  <td className="px-4 py-2">
                    <AuditAksiBadge aksi={r.aksi} />
                  </td>
                  <td className="px-4 py-2">
                    {(r.actor as unknown as { nama: string } | null)?.nama ?? "Sistem"}
                    {r.is_self_action && (
                      <span className="ml-1 text-xs text-neutral-400">(aksi sendiri)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {(r.target as unknown as { nama: string } | null)?.nama ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <details>
                      <summary className="cursor-pointer text-xs text-blue-700">Lihat</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-neutral-50 p-2 text-[11px]">
                        {r.detail == null ? "—" : JSON.stringify(r.detail, null, 2)}
                      </pre>
                    </details>
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
