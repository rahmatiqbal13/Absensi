import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { countActiveSuperAdmins } from "@/lib/employees/super-admin-count";

export default async function PengaturanPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const superAdminCount = await countActiveSuperAdmins(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Pengaturan</h1>
        <p className="mt-1 text-sm text-neutral-500">Konfigurasi dan status sistem.</p>
      </div>
      {superAdminCount === null ? (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Tidak dapat memeriksa jumlah Super Admin aktif saat ini. Silakan muat ulang halaman.
        </p>
      ) : (
        superAdminCount < 2 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Peringatan: sistem ini hanya memiliki {superAdminCount} Super Admin aktif. Minimal 2
            Super Admin diperlukan agar mekanisme persetujuan cuti berjenjang untuk HR/Super Admin
            tetap berfungsi. Tambahkan Super Admin lain sesegera mungkin.
          </p>
        )
      )}

      {(employee.role === "hr_admin" || employee.role === "super_admin") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/pengaturan/libur"
            className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-blue-300"
          >
            <p className="text-sm font-medium text-neutral-900">Hari Libur</p>
            <p className="mt-1 text-xs text-neutral-500">
              Kelola hari libur nasional &amp; cabang untuk perhitungan payroll.
            </p>
          </Link>
          <Link
            href="/pengaturan/audit"
            className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-blue-300"
          >
            <p className="text-sm font-medium text-neutral-900">Log Audit</p>
            <p className="mt-1 text-xs text-neutral-500">
              Riwayat perubahan data karyawan &amp; persetujuan cuti.
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}
