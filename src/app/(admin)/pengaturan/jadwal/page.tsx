import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadSchedules } from "@/lib/schedule/resolve";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { BranchScheduleCard } from "./branch-schedule-card";
import { saveSchedule, removeDepartmentSchedule } from "./actions";

export default async function JadwalPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const [branchRes, deptRes, schedRes] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("departments").select("id, nama, branch_id").order("nama"),
    loadSchedules<{
      jam_masuk: string;
      jam_pulang: string;
      hari_kerja: number[];
      toleransi_terlambat_menit: number;
      potong_terlambat: boolean | null;
    }>(db, "jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit, potong_terlambat"),
  ]);
  if (branchRes.error) console.error("jadwal: branches query failed", branchRes.error);
  if (deptRes.error) console.error("jadwal: departments query failed", deptRes.error);
  if (schedRes.error) console.error("jadwal: schedules query failed", schedRes.error);

  const toDefaults = (s: (typeof schedRes.data)[number]) => ({
    jamMasuk: s.jam_masuk.slice(0, 5),
    jamPulang: s.jam_pulang.slice(0, 5),
    hariKerja: s.hari_kerja,
    toleransiMenit: s.toleransi_terlambat_menit,
    potongTerlambat: s.potong_terlambat === true,
  });
  const branchDefault = new Map(
    schedRes.data.filter((s) => s.department_id === null).map((s) => [s.branch_id, toDefaults(s)]),
  );
  const deptSchedule = new Map(
    schedRes.data.filter((s) => s.department_id !== null).map((s) => [s.department_id as string, toDefaults(s)]),
  );
  const departments = (deptRes.data ?? []) as { id: string; nama: string; branch_id: string }[];
  const branches = branchRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan"
        title="Jadwal Kerja"
        description="Satu jadwal per cabang, dan jadwal khusus per departemen bila jam kerjanya berbeda — dipakai untuk status terlambat dan perhitungan payroll."
      />
      {branches.length === 0 ? (
        <EmptyState icon={Clock} message="Belum ada cabang." />
      ) : (
        <div className="space-y-4">
          {branches.map((b) => (
            <BranchScheduleCard
              key={b.id}
              branchId={b.id}
              branchNama={b.nama}
              branchSchedule={branchDefault.get(b.id) ?? null}
              departments={departments
                .filter((d) => d.branch_id === b.id)
                .map((d) => ({ id: d.id, nama: d.nama, schedule: deptSchedule.get(d.id) ?? null }))}
              saveSchedule={saveSchedule}
              removeDepartmentSchedule={removeDepartmentSchedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}
