import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { LeaveStatusBadge, type LeaveStatus } from "@/components/leave-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { CalendarDays } from "lucide-react";
import { LeaveForm } from "./leave-form";
import { submitLeave } from "./actions";

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function CutiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const { data, error } = await db
    .from("leave_requests")
    .select("id, jenis, tanggal_mulai, tanggal_selesai, status, catatan_approval")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("CutiPage: leave_requests history query failed", error);
  }

  const requests = data ?? [];

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pt-8">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-foreground">Ajukan Cuti</h1>
        <LeaveForm submitLeave={submitLeave} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Riwayat Pengajuan</h2>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>Gagal memuat riwayat cuti. Silakan muat ulang halaman.</AlertDescription>
          </Alert>
        ) : requests.length === 0 ? (
          <EmptyState icon={CalendarDays} message="Belum ada pengajuan cuti." />
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((row) => (
              <li key={row.id}>
                <Card size="sm">
                  <CardContent className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(row.tanggal_mulai)} &ndash; {formatDate(row.tanggal_selesai)}
                      </span>
                      <LeaveStatusBadge status={row.status as LeaveStatus} />
                    </div>
                    {row.catatan_approval && (
                      <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">
                        {row.catatan_approval}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
