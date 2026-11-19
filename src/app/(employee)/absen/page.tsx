import Link from "next/link";
import { Suspense } from "react";
import { Megaphone } from "lucide-react";
import { activeDinasLuar } from "@/lib/requests/service";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { hasActiveConsent } from "@/lib/consent/consent";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";
import { withRosterShift } from "@/lib/schedule/roster";
import { loadOfficeLocation } from "@/lib/attendance/office-location";
import { ClockPanel, type TodaysAttendance } from "./clock-panel";
import { submitClockIn, submitClockOut } from "./actions";
import { MonthSummary, MonthSummarySkeleton } from "./month-summary";

export default async function AbsenPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const consented = await hasActiveConsent(db, employee.id);
  if (!consented) {
    redirect("/absen/consent");
  }

  const { data: branch, error: branchErr } = await db
    .from("branches")
    .select("lat, long, radius_geofencing_meter")
    .eq("id", employee.branchId)
    .single();
  if (branchErr) console.error("absen: branch query failed", branchErr);
  // Department pin when the employee's department has one, else the branch's.
  const office = branch
    ? await loadOfficeLocation(db, branch, employee.branchId, employee.departmentId)
    : null;

  // Separate query so a pre-migration project (no qr_enabled column) still
  // renders the GPS flow instead of erroring the whole branch lookup.
  const { data: qrRow } = await db
    .from("branches")
    .select("qr_enabled")
    .eq("id", employee.branchId)
    .maybeSingle();
  const qrEnabled = qrRow?.qr_enabled ?? false;

  const { data: baseSchedule, error: scheduleErr } = await loadEmployeeSchedule<{
    jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number;
  }>(db, "jam_masuk, jam_pulang, toleransi_terlambat_menit", employee.branchId, employee.departmentId);
  if (scheduleErr) console.error("absen: work schedule query failed", scheduleErr);

  // Do NOT use `new Date().toISOString().slice(0, 10)` here — that's the UTC
  // date, which is the previous day for any instant before 07:00 WIB and
  // would miss the row Task 6's clockIn() wrote under the Jakarta date.
  const today = toJakartaDateOnly(new Date());
  // Today's rostered shift (0059) replaces the regular times in the ribbon.
  const schedule = baseSchedule ? await withRosterShift(db, employee.id, today, baseSchedule) : null;
  const { data: attendance } = await db
    .from("attendances")
    .select("jam_masuk, jam_pulang, status")
    .eq("employee_id", employee.id)
    .eq("tanggal", today)
    .maybeSingle();

  const todaysAttendance: TodaysAttendance = attendance
    ? { jamMasuk: attendance.jam_masuk, jamPulang: attendance.jam_pulang, status: attendance.status }
    : null;

  const formattedToday = new Date(`${today}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const firstName = employee.nama.split(/\s+/)[0] ?? employee.nama;
  const initials = employee.nama
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const dinasLuar = await activeDinasLuar(db, employee.id, today);

  // Latest announcement from the last 7 days (RLS: only those addressed to me).
  const since = new Date(Date.parse(`${today}T00:00:00+07:00`) - 7 * 86_400_000).toISOString();
  const { data: latestAnn } = await db
    .from("announcements")
    .select("id, judul, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-4 pb-7">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-xs text-muted-foreground">{formattedToday}</p>
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground">Halo, {firstName}</h1>
        </div>
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full bg-secondary text-sm font-semibold"
        >
          {initials}
        </span>
      </div>
      {latestAnn && (
        <Link
          href={`/pengumuman#${latestAnn.id}`}
          className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Megaphone className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Pengumuman</span>
            <span className="block truncate text-sm font-semibold text-foreground">{latestAnn.judul}</span>
          </span>
        </Link>
      )}
      <ClockPanel
        dinasLuar={dinasLuar}
        todaysAttendance={todaysAttendance}
        office={{
          lat: office?.lat ?? 0,
          long: office?.long ?? 0,
          radius: office?.radius_geofencing_meter ?? 100,
        }}
        shift={
          schedule
            ? {
                jamMasuk: schedule.jam_masuk.slice(0, 5),
                jamPulang: schedule.jam_pulang.slice(0, 5),
                toleransiMenit: schedule.toleransi_terlambat_menit,
              }
            : null
        }
        qrEnabled={qrEnabled}
        firstName={firstName}
        submitClockIn={submitClockIn}
        submitClockOut={submitClockOut}
      />
      <Suspense fallback={<MonthSummarySkeleton />}>
        <MonthSummary db={db} employee={employee} today={today} />
      </Suspense>
    </main>
  );
}
