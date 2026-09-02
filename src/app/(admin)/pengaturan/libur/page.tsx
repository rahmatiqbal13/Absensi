import { redirect } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { ResponsiveTable } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HolidayForm } from "./holiday-form";
import { YearFilter } from "./year-filter";
import { addHoliday, deleteHoliday } from "./actions";

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" });

export default async function LiburPage({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const tahun = sp.tahun ?? String(new Date().getFullYear());
  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const { data: holidays, error } = await db
    .from("holidays")
    .select("id, tanggal, nama, branches(nama)")
    .gte("tanggal", `${tahun}-01-01`)
    .lte("tanggal", `${tahun}-12-31`)
    .order("tanggal");

  async function remove(id: string) {
    "use server";
    const res = await deleteHoliday(id);
    if (!res.ok) console.error("LiburPage: deleteHoliday failed", res.error);
    return res;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hari Libur ${tahun}`}
        description="Dipakai payroll untuk menghitung hari kerja efektif."
      />

      <FilterBar>
        <YearFilter tahun={tahun} />
      </FilterBar>

      <Card>
        <CardContent>
          <HolidayForm branches={branches ?? []} addHoliday={addHoliday} />
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar libur.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            {
              key: "tanggal",
              header: "Tanggal",
              cell: (h) => fmt.format(new Date(`${h.tanggal}T00:00:00Z`)),
            },
            { key: "nama", header: "Nama", mobileLabel: "Nama", cell: (h) => h.nama },
            {
              key: "cakupan",
              header: "Cakupan",
              mobileLabel: "Cakupan",
              cell: (h) => (h.branches as unknown as { nama: string } | null)?.nama ?? "Nasional",
            },
            {
              key: "aksi",
              header: "Aksi",
              align: "right",
              cell: (h) => (
                <ConfirmDeleteButton
                  action={() => remove(h.id)}
                  title="Hapus hari libur?"
                  description={`"${h.nama}" pada ${fmt.format(new Date(`${h.tanggal}T00:00:00Z`))} akan dihapus.`}
                />
              ),
            },
          ]}
          rows={holidays ?? []}
          rowKey={(h) => h.id}
          caption={`Daftar hari libur ${tahun}`}
          emptyState={<EmptyState icon={CalendarOff} message={`Belum ada libur tercatat untuk ${tahun}.`} />}
        />
      )}
    </div>
  );
}
