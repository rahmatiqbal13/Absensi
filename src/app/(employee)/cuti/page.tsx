import { redirect } from "next/navigation";
import { RequestTabs } from "@/components/request-tabs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { LeaveStatusBadge, type LeaveStatus } from "@/components/leave-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { CalendarDays, Paperclip } from "lucide-react";
import { getLeaveBalance } from "@/lib/leave/balance-lookup";
import { isMagang } from "@/lib/employees/contracts";
import { annualLeaveEligibleFrom } from "@/lib/leave/eligibility";
import { leaveJenisLabel } from "@/lib/leave/labels";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { LeaveForm } from "./leave-form";
import { cancelLeave, submitLeave } from "./actions";
import { CancelLeaveButton } from "./cancel-leave-button";

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
    .select("id, jenis, tanggal_mulai, tanggal_selesai, status, catatan_approval, lampiran_url")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("CutiPage: leave_requests history query failed", error);
  }

  const requests = data ?? [];

  // Annual-leave allowance for this year (PRD: "karyawan ingin melihat sisa
  // saldo cuti"). Same default as the approval RPC when no row exists yet.
  const today = toJakartaDateOnly(new Date());
  const tahun = Number(today.slice(0, 4));
  const magang = isMagang(employee.statusKontrak);
  const [balanceRes, { data: me }] = await Promise.all([
    getLeaveBalance(db, employee.id, tahun, { magang }),
    db.from("employees").select("tanggal_mulai_kerja").eq("id", employee.id).maybeSingle(),
  ]);
  if (!balanceRes.ok) console.error("CutiPage: balance lookup failed", balanceRes.error);
  const eligibleFrom = annualLeaveEligibleFrom((me?.tanggal_mulai_kerja as string | null) ?? null);
  const notYetEligible = eligibleFrom != null && today < eligibleFrom;

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pt-8">
      <RequestTabs active="cuti" />
      <section aria-labelledby="saldo-heading" className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <h2 id="saldo-heading" className="text-sm font-medium opacity-85">Sisa cuti tahunan {tahun}</h2>
        {balanceRes.ok ? (
          <>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-[-0.03em] tabular-nums">
                {Number.isInteger(balanceRes.balance.sisa) ? balanceRes.balance.sisa : balanceRes.balance.sisa.toFixed(1)}
              </span>
              <span className="text-sm opacity-85">dari {balanceRes.balance.awal} hari</span>
            </p>
            <p className="mt-1 text-sm opacity-85">
              Terpakai {balanceRes.balance.terpakai} hari. Sisa cuti hangus pada 31 Desember {tahun}.
            </p>
            {magang && (
              <p className="mt-3 rounded-lg bg-primary-foreground/15 px-3 py-2 text-sm">
                Anak magang tidak mendapat jatah cuti tahunan. Cuti sakit dan izin khusus tetap bisa diajukan.
              </p>
            )}
            {!magang && notYetEligible && (
              <p className="mt-3 rounded-lg bg-primary-foreground/15 px-3 py-2 text-sm">
                Cuti tahunan bisa diajukan mulai{" "}
                <b>{formatDate(eligibleFrom!)}</b> (setelah 12 bulan bekerja). Cuti sakit dan izin khusus tetap bisa
                diajukan.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm opacity-85">Saldo belum bisa dimuat. Muat ulang halaman.</p>
        )}
      </section>
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
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">{leaveJenisLabel(row.jenis)}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(row.tanggal_mulai)} &ndash; {formatDate(row.tanggal_selesai)}
                        </span>
                        {row.lampiran_url && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="size-3.5" aria-hidden="true" /> Lampiran terkirim
                          </span>
                        )}
                      </span>
                      <LeaveStatusBadge status={row.status as LeaveStatus} />
                    </div>
                    {row.catatan_approval && (
                      <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">
                        {row.catatan_approval}
                      </p>
                    )}
                    {/* Mirrors cancel_leave_request (migration 0040): pending any
                        time, approved only before it starts. */}
                    {(row.status === "pending" || (row.status === "approved" && row.tanggal_mulai > today)) && (
                      <CancelLeaveButton
                        action={cancelLeave.bind(null, row.id)}
                        approved={row.status === "approved"}
                        refundsBalance={row.jenis === "tahunan"}
                      />
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
