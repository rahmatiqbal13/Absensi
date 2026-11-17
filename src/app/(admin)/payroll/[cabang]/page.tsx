import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid, payrollPeriodPathById } from "@/lib/routing/paths";

// Old links were /payroll/<period uuid>; send them to /payroll/<cabang>/<YYYY-MM>.
// A bare /payroll/<cabang> has no page of its own — back to the list.
export default async function LegacyPayrollPeriodRedirect({ params }: { params: Promise<{ cabang: string }> }) {
  const { cabang } = await params;
  if (isUuid(cabang)) {
    const target = await payrollPeriodPathById(await createServerSupabaseClient(), cabang);
    if (target) redirect(target);
  }
  redirect("/payroll");
}
