import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RosterGrid, ShiftList, type ShiftRow } from "./shift-editor";
import { copyPreviousWeek, createShift, deleteShift, setRosterDay } from "./actions";

export const metadata = { title: "Shift & roster" };

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
function mondayOf(d: string): string {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

export default async function ShiftPage({ searchParams }: { searchParams: Promise<{ cabang?: string; minggu?: string }> }) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  if (me.role !== "hr_admin" && me.role !== "super_admin") redirect("/pengaturan");

  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const branchList = (branches ?? []) as { id: string; nama: string }[];
  const cabang = branchList.find((b) => b.id === sp.cabang)?.id ?? branchList[0]?.id;
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.minggu ?? "") ? sp.minggu! : toJakartaDateOnly(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const header = (
    <PageHeader
      eyebrow="Pengaturan"
      title="Shift & roster"
      description="Buat shift per cabang, lalu tempatkan karyawan ke shift per tanggal. Absen, pengingat, laporan, dan payroll mengikuti roster."
    />
  );
  if (!cabang) return <div className="space-y-6">{header}<p className="text-sm">Belum ada cabang.</p></div>;

  const [shiftRes, empRes] = await Promise.all([
    db.from("shifts").select("id, nama, jam_masuk, jam_pulang, toleransi_terlambat_menit").eq("branch_id", cabang).order("jam_masuk"),
    db.from("employees").select("id, nama").eq("branch_id", cabang).eq("status", "aktif").neq("role", "super_admin").order("nama"),
  ]);
  const employees = (empRes.data ?? []) as { id: string; nama: string }[];
  const { data: rows, error: rosterErr } = employees.length
    ? await db
        .from("shift_assignments")
        .select("employee_id, tanggal, shift_id")
        .in("employee_id", employees.map((e) => e.id))
        .gte("tanggal", days[0])
        .lte("tanggal", days[6])
    : { data: [], error: null };
  if (shiftRes.error || rosterErr) {
    return (
      <div className="space-y-6">
        {header}
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat shift. Pastikan migrasi 0059 sudah dijalankan.</AlertDescription>
        </Alert>
      </div>
    );
  }
  const assignments: Record<string, string> = {};
  for (const r of rows ?? []) assignments[`${r.employee_id}|${r.tanggal}`] = (r.shift_id as string | null) ?? "libur";
  const q = (minggu: string) => `/pengaturan/shift?${new URLSearchParams({ cabang, minggu })}`;
  const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      {header}
      <form className="flex flex-wrap items-end gap-2" action="/pengaturan/shift">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Cabang
          <select name="cabang" defaultValue={cabang} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            {branchList.map((b) => (
              <option key={b.id} value={b.id}>{b.nama}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="minggu" value={monday} />
        <Button type="submit" variant="outline" size="sm" className="h-10">Tampilkan</Button>
      </form>
      <ShiftList shifts={(shiftRes.data ?? []) as ShiftRow[]} create={createShift.bind(null, cabang)} remove={deleteShift} />
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={q(addDays(monday, -7))} aria-label="Minggu sebelumnya"><ChevronLeft className="size-4" /></Link>
        </Button>
        <span className="text-sm font-semibold">
          {fmt.format(new Date(`${days[0]}T00:00:00Z`))} – {fmt.format(new Date(`${days[6]}T00:00:00Z`))}
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href={q(addDays(monday, 7))} aria-label="Minggu berikutnya"><ChevronRight className="size-4" /></Link>
        </Button>
      </div>
      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada karyawan aktif di cabang ini.</p>
      ) : (
        <RosterGrid
          key={`${cabang}-${monday}`}
          days={days}
          employees={employees}
          shifts={(shiftRes.data ?? []) as ShiftRow[]}
          assignments={assignments}
          setDay={setRosterDay}
          copyPrevious={copyPreviousWeek.bind(null, employees.map((e) => e.id), monday)}
        />
      )}
    </div>
  );
}
