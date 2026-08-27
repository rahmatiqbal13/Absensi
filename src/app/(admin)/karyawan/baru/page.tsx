import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { CreateEmployeeForm } from "./create-employee-form";
import { createEmployee } from "../actions";

export default async function KaryawanBaruPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const [
    { data: branches, error: branchesError },
    { data: departments, error: departmentsError },
    { data: approvers, error: approversError },
  ] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("departments").select("id, nama").order("nama"),
    db.from("employees").select("id, nama").eq("status", "aktif").order("nama"),
  ]);
  if (branchesError) console.error("KaryawanBaruPage: branches lookup failed", branchesError);
  if (departmentsError) console.error("KaryawanBaruPage: departments lookup failed", departmentsError);
  if (approversError) console.error("KaryawanBaruPage: approvers lookup failed", approversError);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Tambah Karyawan</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Buat akun, lalu kirim link set-password ke karyawan.
        </p>
      </div>
      <CreateEmployeeForm
        branches={branches ?? []}
        departments={departments ?? []}
        approverOptions={approvers ?? []}
        createEmployee={createEmployee}
      />
    </div>
  );
}
