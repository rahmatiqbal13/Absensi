import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadSchedules } from "@/lib/schedule/resolve";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { BranchScheduleCard } from "./branch-schedule-card";
import { CustomSchedules, type CustomSchedule } from "./custom-schedules";
import {
  deleteCustomSchedule,
  removeDepartmentSchedule,
  saveCustomSchedule,
  saveSchedule,
  setCustomScheduleMembers,
} from "./actions";

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
      hitung_lembur: boolean | null;
    }>(db, "jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit, potong_terlambat, hitung_lembur"),
  ]);
  if (branchRes.error) console.error("jadwal: branches query failed", branchRes.error);
  if (deptRes.error) console.error("jadwal: departments query failed", deptRes.error);
  if (schedRes.error) console.error("jadwal: schedules query failed", schedRes.error);

  // Who follows which jadwal khusus (0065). Before the migration the column is
  // missing: fall back to the plain list, so the section shows but nobody is assigned.
  let staffRes = await db
    .from("employees")
    .select("id, nama, branch_id, department_id, work_schedule_id")
    .eq("status", "aktif")
    .order("nama");
  const khususReady = !staffRes.error;
  if (staffRes.error) {
    staffRes = (await db
      .from("employees")
      .select("id, nama, branch_id, department_id")
      .eq("status", "aktif")
      .order("nama")) as typeof staffRes;
  }
  const staff = (staffRes.data ?? []) as {
    id: string; nama: string; branch_id: string; department_id: string | null; work_schedule_id?: string | null;
  }[];

  const toDefaults = (s: (typeof schedRes.data)[number]) => ({
    jamMasuk: s.jam_masuk.slice(0, 5),
    jamPulang: s.jam_pulang.slice(0, 5),
    hariKerja: s.hari_kerja,
    toleransiMenit: s.toleransi_terlambat_menit,
    potongTerlambat: s.potong_terlambat === true,
    hitungLembur: s.hitung_lembur === true,
  });
  const branchDefault = new Map(
    schedRes.data.filter((s) => s.department_id === null && !s.nama).map((s) => [s.branch_id, toDefaults(s)]),
  );
  const deptSchedule = new Map(
    schedRes.data.filter((s) => s.department_id !== null).map((s) => [s.department_id as string, toDefaults(s)]),
  );
  const departments = (deptRes.data ?? []) as { id: string; nama: string; branch_id: string }[];
  const deptName = new Map(departments.map((d) => [d.id, d.nama]));
  const customByBranch = new Map<string, CustomSchedule[]>();
  for (const s of schedRes.data.filter((s) => s.nama)) {
    const list = customByBranch.get(s.branch_id) ?? [];
    list.push({
      id: s.id as string,
      nama: s.nama as string,
      schedule: toDefaults(s),
      memberIds: staff.filter((e) => e.work_schedule_id === s.id).map((e) => e.id),
    });
    customByBranch.set(s.branch_id, list);
  }
  const branches = branchRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan"
        title="Jadwal Kerja"
        description="Satu jadwal per cabang, jadwal sendiri per departemen, dan jadwal khusus untuk pegawai tertentu yang jam kerjanya berbeda — dipakai untuk status terlambat dan perhitungan payroll."
      />
      {branches.length === 0 ? (
        <EmptyState icon={Clock} message="Belum ada cabang." />
      ) : (
        <div className="space-y-4">
          {branches.map((b) => (
            <div key={b.id} className="space-y-4">
              <BranchScheduleCard
                branchId={b.id}
                branchNama={b.nama}
                branchSchedule={branchDefault.get(b.id) ?? null}
                departments={departments
                  .filter((d) => d.branch_id === b.id)
                  .map((d) => ({ id: d.id, nama: d.nama, schedule: deptSchedule.get(d.id) ?? null }))}
                saveSchedule={saveSchedule}
                removeDepartmentSchedule={removeDepartmentSchedule}
              />
              {/* Right under its branch: the jadwal khusus of that branch (0065). */}
              {khususReady && (
                <CustomSchedules
                  branchId={b.id}
                  branchNama={b.nama}
                  schedules={(customByBranch.get(b.id) ?? []).sort((x, y) => x.nama.localeCompare(y.nama))}
                  employees={staff
                    .filter((e) => e.branch_id === b.id)
                    .map((e) => ({
                      id: e.id,
                      nama: e.nama,
                      departemen: e.department_id ? deptName.get(e.department_id) ?? null : null,
                      scheduleId: e.work_schedule_id ?? null,
                    }))}
                  saveCustomSchedule={saveCustomSchedule}
                  deleteCustomSchedule={deleteCustomSchedule}
                  setCustomScheduleMembers={setCustomScheduleMembers}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
