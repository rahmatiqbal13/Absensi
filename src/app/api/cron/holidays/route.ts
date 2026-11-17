import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { defaultSyncYears, syncNationalHolidays } from "@/lib/holidays/national-sync";

// Weekly national-holiday sync (see vercel.json). Any scheduler works: send
// `Authorization: Bearer $CRON_SECRET` — Vercel Cron does this automatically.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const res = await syncNationalHolidays(createServiceRoleSupabaseClient(), { years: defaultSyncYears() });
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
