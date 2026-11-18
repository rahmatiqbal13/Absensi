import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { sendContractReminders } from "@/lib/employees/send-contract-reminders";

// Daily contract-ending reminder for HR (pg_cron, migration 0049). Called with
// `Authorization: Bearer $CRON_SECRET`; repeat calls never duplicate a notice.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const res = await sendContractReminders(createServiceRoleSupabaseClient());
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
