import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ScheduleForm } from "./schedule-form";
import { saveSchedule } from "./actions";

export default async function JadwalPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error: branchErr } = await db.from("branches").select("id, nama").order("nama");
  if (branchErr) console.error("jadwal: branches query failed", branchErr);
  const { data: schedules, error: schedErr } = await db
    .from("work_schedules")
    .select("branch_id, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit");
  if (schedErr) console.error("jadwal: schedules query failed", schedErr);

  const byBranch = new Map(
    (schedules ?? []).map((s) => [
      s.branch_id,
      { jamMasuk: s.jam_masuk.slice(0, 5), jamPulang: s.jam_pulang.slice(0, 5), hariKerja: s.hari_kerja, toleransiMenit: s.toleransi_terlambat_menit },
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jadwal Kerja"
        description="Satu jadwal per cabang — dipakai untuk status terlambat dan perhitungan payroll."
      />
      {(branches ?? []).length === 0 ? (
        <EmptyState icon={Clock} message="Belum ada cabang." />
      ) : (
        <div className="space-y-4">
          {(branches ?? []).map((b) => (
            <ScheduleForm
              key={b.id}
              branchId={b.id}
              branchNama={b.nama}
              defaults={byBranch.get(b.id) ?? null}
              saveSchedule={saveSchedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}
