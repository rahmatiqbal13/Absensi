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
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Pengaturan</h1>
      {superAdminCount < 2 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Peringatan: sistem ini hanya memiliki {superAdminCount} Super Admin aktif. Minimal 2
          Super Admin diperlukan agar mekanisme persetujuan cuti berjenjang untuk HR/Super Admin
          tetap berfungsi. Tambahkan Super Admin lain sesegera mungkin.
        </p>
      )}
    </main>
  );
}
