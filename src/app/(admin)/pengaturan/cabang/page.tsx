import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadSchedules } from "@/lib/schedule/resolve";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BranchManager, type BranchRow } from "./branch-manager";
import { createBranch, updateBranch, deleteBranch } from "./actions";

export default async function CabangPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error } = await db
    .from("branches")
    .select("id, nama, alamat, lat, long")
    .order("nama");
  if (error) console.error("cabang: branches query failed", error);

  // Only the branch default counts as "schedule set"; department rows are overrides.
  const { data: scheds } = await loadSchedules<object>(db, "id");
  const schedSet = new Set(scheds.filter((s) => s.department_id === null).map((s) => s.branch_id));

  const rows: BranchRow[] = (branches ?? []).map((b) => ({
    id: b.id,
    nama: b.nama,
    alamat: b.alamat,
    lat: b.lat,
    long: b.long,
    scheduleSet: schedSet.has(b.id),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan" title="Cabang" description="Kelola kantor cabang: nama dan alamat." />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar cabang.</AlertDescription>
        </Alert>
      ) : (
        <BranchManager
          branches={rows}
          createBranch={createBranch}
          updateBranch={updateBranch}
          deleteBranch={deleteBranch}
        />
      )}
    </div>
  );
}
