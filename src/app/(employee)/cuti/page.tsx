import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { LeaveStatusBadge, type LeaveStatus } from "@/components/leave-status-badge";
import { LeaveForm } from "./leave-form";
import { submitLeave } from "./actions";

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function CutiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const { data, error } = await db
    .from("leave_requests")
    .select("id, jenis, tanggal_mulai, tanggal_selesai, status, catatan_approval")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("CutiPage: leave_requests history query failed", error);
  }

  const requests = data ?? [];

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pt-8">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Ajukan Cuti</h1>
        <LeaveForm submitLeave={submitLeave} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold text-neutral-900">Riwayat Pengajuan</h2>
        {error ? (
          <p className="text-sm text-red-600">Gagal memuat riwayat cuti. Silakan muat ulang halaman.</p>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="text-sm text-neutral-500">Belum ada pengajuan cuti.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1.5 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-neutral-900">
                    {formatDate(row.tanggal_mulai)} &ndash; {formatDate(row.tanggal_selesai)}
                  </span>
                  <LeaveStatusBadge status={row.status as LeaveStatus} />
                </div>
                {row.catatan_approval && (
                  <span className="rounded-lg bg-neutral-50 px-2.5 py-1.5 text-sm text-neutral-600">
                    {row.catatan_approval}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
