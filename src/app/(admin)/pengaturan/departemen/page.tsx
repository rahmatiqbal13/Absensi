import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { DepartmentForm } from "./department-form";
import { addDepartment, deleteDepartment } from "./actions";

export default async function DepartemenPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const { data: departments, error } = await db
    .from("departments")
    .select("id, nama, branches(nama)")
    .order("nama");

  async function remove(id: string) {
    "use server";
    const res = await deleteDepartment(id);
    if (!res.ok) console.error("DepartemenPage: deleteDepartment failed", res.error);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Departemen</h1>
        <p className="mt-1 text-sm text-neutral-500">Kelompokkan karyawan per departemen di tiap cabang.</p>
      </div>

      <DepartmentForm branches={branches ?? []} addDepartment={addDepartment} />

      {error && <p className="text-sm text-red-600">Gagal memuat daftar departemen.</p>}
      {!error && (!departments || departments.length === 0) && (
        <p className="text-sm text-neutral-500">Belum ada departemen.</p>
      )}
      {departments && departments.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white text-sm">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-2">
              <span>
                <span className="font-medium">{d.nama}</span>{" "}
                <span className="text-neutral-500">· {(d.branches as unknown as { nama: string } | null)?.nama ?? "-"}</span>
              </span>
              <form action={remove.bind(null, d.id)}>
                <button type="submit" className="text-xs text-red-600 hover:underline">Hapus</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
