import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { branchesWithoutSchedule, templateUsage, type AppliedRow } from "@/lib/schedule/templates";
import { ScheduleTemplates, type Template } from "./schedule-templates";
import { deleteTemplate, saveTemplate, setTemplateTargets } from "./actions";

export default async function JadwalPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const [branchRes, deptRes, tplRes, rowRes, staffRes] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("departments").select("id, nama, branch_id").order("nama"),
    db
      .from("schedule_templates")
      .select("id, nama, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit, potong_terlambat, hitung_lembur")
      .order("nama"),
    db.from("work_schedules").select("id, template_id, branch_id, department_id, nama"),
    db.from("employees").select("id, nama, branch_id, department_id, work_schedule_id").eq("status", "aktif").order("nama"),
  ]);
  for (const [what, res] of [["branches", branchRes], ["departments", deptRes], ["work_schedules", rowRes], ["employees", staffRes]] as const) {
    if (res.error) console.error(`jadwal: ${what} query failed`, res.error);
  }
  const notMigrated = !!tplRes.error || !!rowRes.error;
  if (tplRes.error) console.error("jadwal: schedule_templates query failed", tplRes.error);

  const branches = (branchRes.data ?? []) as { id: string; nama: string }[];
  const rows = (rowRes.data ?? []) as AppliedRow[];
  const staff = (staffRes.data ?? []) as {
    id: string; nama: string; branch_id: string; department_id: string | null; work_schedule_id: string | null;
  }[];
  const usage = templateUsage(rows, staff);
  const templates: Template[] = ((tplRes.data ?? []) as {
    id: string; nama: string; jam_masuk: string; jam_pulang: string; hari_kerja: number[];
    toleransi_terlambat_menit: number; potong_terlambat: boolean; hitung_lembur: boolean;
  }[]).map((t) => ({
    id: t.id,
    nama: t.nama,
    schedule: {
      jamMasuk: t.jam_masuk.slice(0, 5),
      jamPulang: t.jam_pulang.slice(0, 5),
      hariKerja: t.hari_kerja,
      toleransiMenit: t.toleransi_terlambat_menit,
      potongTerlambat: t.potong_terlambat,
      hitungLembur: t.hitung_lembur,
    },
    usage: usage.get(t.id) ?? { branchIds: [], departmentIds: [], employeeIds: [] },
  }));
  const missing = notMigrated ? [] : branchesWithoutSchedule(branches, rows);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan"
        title="Jadwal Kerja"
        description="Buat jadwal sekali, lalu tentukan berlaku untuk cabang, departemen, atau pegawai mana. Satu jadwal bisa dipakai beberapa cabang sekaligus; mengubah jamnya langsung berlaku untuk semuanya. Dipakai untuk status terlambat, pengingat, dan payroll."
      />
      {notMigrated ? (
        <Alert variant="destructive">
          <AlertDescription>
            Database belum siap untuk menu jadwal ini. Jalankan migrasi <span className="font-mono">0067_schedule_templates.sql</span> dulu.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {missing.length > 0 && (
            <Alert variant="warning">
              <AlertDescription>
                Cabang tanpa jadwal utama: <b>{missing.map((b) => b.nama).join(", ")}</b>. Pegawainya tidak bisa dinilai terlambat
                atau pulang cepat. Buka sebuah jadwal → Berlaku untuk → centang cabangnya.
              </AlertDescription>
            </Alert>
          )}
          <ScheduleTemplates
            templates={templates}
            branches={branches}
            departments={((deptRes.data ?? []) as { id: string; nama: string; branch_id: string }[]).map((d) => ({
              id: d.id,
              nama: d.nama,
              branchId: d.branch_id,
            }))}
            staff={staff.map((e) => ({ id: e.id, nama: e.nama, branchId: e.branch_id, departmentId: e.department_id }))}
            saveTemplate={saveTemplate}
            setTemplateTargets={setTemplateTargets}
            deleteTemplate={deleteTemplate}
          />
        </>
      )}
    </div>
  );
}
