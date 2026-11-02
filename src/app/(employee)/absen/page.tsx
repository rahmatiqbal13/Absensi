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

  const { data: branch, error: branchErr } = await db
    .from("branches")
    .select("lat, long, radius_geofencing_meter")
    .eq("id", employee.branchId)
    .single();
  if (branchErr) console.error("absen: branch query failed", branchErr);

  // Separate query so a pre-migration project (no qr_enabled column) still
  // renders the GPS flow instead of erroring the whole branch lookup.
  const { data: qrRow } = await db
    .from("branches")
    .select("qr_enabled")
    .eq("id", employee.branchId)
    .maybeSingle();
  const qrEnabled = qrRow?.qr_enabled ?? false;

  const { data: schedule, error: scheduleErr } = await db
    .from("work_schedules")
    .select("jam_masuk, jam_pulang, toleransi_terlambat_menit")
    .eq("branch_id", employee.branchId)
    .limit(1)
    .maybeSingle();
  if (scheduleErr) console.error("absen: work schedule query failed", scheduleErr);

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

  const firstName = employee.nama.split(/\s+/)[0] ?? employee.nama;
  const initials = employee.nama
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

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
      <ClockPanel
        todaysAttendance={todaysAttendance}
        office={{
          lat: branch?.lat ?? 0,
          long: branch?.long ?? 0,
          radius: branch?.radius_geofencing_meter ?? 100,
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
    </main>
  );
}
