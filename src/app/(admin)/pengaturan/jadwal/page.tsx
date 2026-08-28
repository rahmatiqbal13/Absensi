import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
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
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Jadwal Kerja</h1>
        <p className="mt-1 text-sm text-neutral-500">Satu jadwal per cabang — dipakai untuk status terlambat dan perhitungan payroll.</p>
      </div>
      {(branches ?? []).length === 0 && <p className="text-sm text-neutral-500">Belum ada cabang.</p>}
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
    </div>
  );
}
