import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { sendAttendanceReminders } from "@/lib/attendance/send-reminders";

// "Lupa absen" reminder pass. Called every 15 minutes by pg_cron (migration
// 0047) with `Authorization: Bearer $CRON_SECRET`; safe to call more often —
// each employee is reminded at most once a day.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const res = await sendAttendanceReminders(createServiceRoleSupabaseClient());
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
