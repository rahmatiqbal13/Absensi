import { redirect } from "next/navigation";
import { Network } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { DepartmentForm } from "./department-form";
import { EditDepartmentButton } from "./edit-department-button";
import { addDepartment, deleteDepartment, updateDepartment } from "./actions";

export default async function DepartemenPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error: branchesErr } = await db.from("branches").select("id, nama").order("nama");
  if (branchesErr) console.error("DepartemenPage: branches query failed", branchesErr);
  const [{ data: departments, error }, { data: staff, error: staffErr }] = await Promise.all([
    db.from("departments").select("id, nama, branch_id").order("nama"),
    db.from("employees").select("department_id").eq("status", "aktif").not("department_id", "is", null),
  ]);
  if (staffErr) console.error("DepartemenPage: employee count failed", staffErr);

  // Active headcount per department; a failed count just hides the numbers.
  const headcount = new Map<string, number>();
  for (const e of staffErr ? [] : (staff ?? [])) {
    const id = e.department_id as string;
    headcount.set(id, (headcount.get(id) ?? 0) + 1);
  }
  const columns = (branches ?? [])
    .map((b) => {
      const items = (departments ?? [])
        .filter((d) => d.branch_id === b.id)
        .map((d) => ({ id: d.id as string, nama: d.nama as string, n: headcount.get(d.id as string) ?? 0 }));
      return { id: b.id as string, nama: b.nama as string, items, total: items.reduce((a, d) => a + d.n, 0) };
    })
    .filter((c) => c.items.length > 0);

  async function update(id: string, fd: FormData) {
    "use server";
    return updateDepartment(id, fd);
  }

  async function remove(id: string) {
    "use server";
    const res = await deleteDepartment(id);
    if (!res.ok) console.error("DepartemenPage: deleteDepartment failed", res.error);
    return res;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan"
        title="Departemen"
        description="Kelompokkan karyawan per departemen di tiap cabang."
      />
      <Card>
        <CardContent>
          <DepartmentForm branches={branches ?? []} addDepartment={addDepartment} />
        </CardContent>
      </Card>

      {error || branchesErr ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar departemen.</AlertDescription>
        </Alert>
      ) : (
        columns.length === 0 ? (
          <EmptyState icon={Network} message="Belum ada departemen." />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {columns.map((c) => {
              const max = Math.max(1, ...c.items.map((d) => d.n));
              return (
                <section
                  key={c.id}
                  aria-labelledby={`dept-${c.id}`}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h2 id={`dept-${c.id}`} className="text-base font-semibold">{c.nama}</h2>
                    {!staffErr && (
                      <span className="font-mono text-xs text-muted-foreground">{c.total} org</span>
                    )}
                  </div>
                  <ul className="flex flex-col">
                    {c.items.map((d) => (
                      <li
                        key={d.id}
                        className="flex min-h-11 items-center justify-between gap-3 border-t border-hairline text-sm"
                      >
                        <span className="min-w-0 truncate">{d.nama}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {!staffErr && (
                            <>
                              <span
                                aria-hidden="true"
                                className="h-1.5 rounded-[3px] bg-primary"
                                style={{ width: `${Math.max(4, (d.n / max) * 72)}px` }}
                              />
                              <span className="w-6 text-right font-mono text-[0.8rem] tabular-nums">
                                <span className="sr-only">{d.n} karyawan</span>
                                <span aria-hidden="true">{d.n}</span>
                              </span>
                            </>
                          )}
                          <EditDepartmentButton
                            department={{ id: d.id, nama: d.nama, branchId: c.id }}
                            branches={branches ?? []}
                            headcount={staffErr ? null : d.n}
                            updateDepartment={update.bind(null, d.id)}
                          />
                          <ConfirmDeleteButton
                            action={remove.bind(null, d.id)}
                            title="Hapus departemen?"
                            description={`Departemen "${d.nama}" akan dihapus. Karyawan di dalamnya tidak ikut terhapus.`}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
