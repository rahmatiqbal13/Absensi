import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { hasActiveConsent } from "@/lib/consent/consent";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { ClockPanel, type TodaysAttendance } from "./clock-panel";
import { submitClockIn, submitClockOut } from "./actions";

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

  const { data: branch } = await db
    .from("branches")
    .select("lat, long, radius_geofencing_meter")
    .eq("id", employee.branchId)
    .single();

  const { data: schedule } = await db
    .from("work_schedules")
    .select("jam_masuk, toleransi_terlambat_menit")
    .eq("branch_id", employee.branchId)
    .limit(1)
    .maybeSingle();

  // Do NOT use `new Date().toISOString().slice(0, 10)` here — that's the UTC
  // date, which is the previous day for any instant before 07:00 WIB and
  // would miss the row Task 6's clockIn() wrote under the Jakarta date.
  const today = toJakartaDateOnly(new Date());
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

  return (
    <main className="mx-auto max-w-md p-4 pt-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{formattedToday}</p>
        <h1 className="text-2xl font-semibold text-foreground">Halo, {employee.nama}</h1>
      </div>
      <ClockPanel
        todaysAttendance={todaysAttendance}
        office={{
          lat: branch?.lat ?? 0,
          long: branch?.long ?? 0,
          radius: branch?.radius_geofencing_meter ?? 100,
        }}
        shift={
          schedule
            ? { jamMasuk: schedule.jam_masuk.slice(0, 5), toleransiMenit: schedule.toleransi_terlambat_menit }
            : null
        }
        submitClockIn={submitClockIn}
        submitClockOut={submitClockOut}
      />
    </main>
  );
}
