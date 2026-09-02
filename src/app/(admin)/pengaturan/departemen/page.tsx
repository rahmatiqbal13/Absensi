import { redirect } from "next/navigation";
import { Network } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResponsiveTable } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
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
    return res;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departemen"
        description="Kelompokkan karyawan per departemen di tiap cabang."
      />
      <Card>
        <CardContent>
          <DepartmentForm branches={branches ?? []} addDepartment={addDepartment} />
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar departemen.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            { key: "nama", header: "Nama", cell: (d) => d.nama },
            {
              key: "cabang",
              header: "Cabang",
              mobileLabel: "Cabang",
              cell: (d) => (d.branches as unknown as { nama: string } | null)?.nama ?? "-",
            },
            {
              key: "aksi",
              header: "Aksi",
              align: "right",
              cell: (d) => (
                <ConfirmDeleteButton
                  action={remove.bind(null, d.id)}
                  title="Hapus departemen?"
                  description={`Departemen "${d.nama}" akan dihapus. Karyawan di dalamnya tidak ikut terhapus.`}
                />
              ),
            },
          ]}
          rows={departments ?? []}
          rowKey={(d) => d.id}
          caption="Daftar departemen"
          emptyState={<EmptyState icon={Network} message="Belum ada departemen." />}
        />
      )}
    </div>
  );
}
