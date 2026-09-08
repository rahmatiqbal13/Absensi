import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { BranchManager, type BranchRow } from "./branch-manager";
import { createBranch, updateBranch, deleteBranch } from "./actions";

export default async function CabangPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error } = await db
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter")
    .order("nama");
  if (error) console.error("cabang: branches query failed", error);

  const { data: emps } = await db.from("employees").select("branch_id");
  const { data: depts } = await db.from("departments").select("branch_id");
  const tally = (rows: { branch_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.branch_id, (m.get(r.branch_id) ?? 0) + 1);
    return m;
  };
  const empBy = tally(emps);
  const deptBy = tally(depts);

  const rows: BranchRow[] = (branches ?? []).map((b) => ({
    id: b.id,
    nama: b.nama,
    alamat: b.alamat,
    lat: b.lat,
    long: b.long,
    radius: b.radius_geofencing_meter,
    employeeCount: empBy.get(b.id) ?? 0,
    departmentCount: deptBy.get(b.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cabang"
        description="Kelola kantor cabang: nama dan alamat. Titik & radius diatur di menu Lokasi Kantor."
      />
      <BranchManager
        branches={rows}
        createBranch={createBranch}
        updateBranch={updateBranch}
        deleteBranch={deleteBranch}
      />
    </div>
  );
}
