import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { correctionMinDate, toJakartaHHMM } from "@/lib/attendance/correction";
import { RequestTabs } from "@/components/request-tabs";
import { EmptyState } from "@/components/empty-state";
import { AttendanceCorrectionForm } from "@/components/attendance-correction-dialog";
import { LeaveStatusBadge, type LeaveStatus } from "@/components/leave-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { cancelAttendanceCorrection, submitAttendanceCorrection } from "./actions";
import { CancelCorrectionButton } from "./cancel-correction-button";

export const metadata = { title: "Koreksi absensi" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatTanggal(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function KoreksiPage({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  const { tanggal } = await searchParams;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");

  const today = toJakartaDateOnly(new Date());
  const minDate = correctionMinDate(today);
  // ?tanggal= prefills the form (linked from a day on Riwayat).
  const prefill = tanggal && DATE_RE.test(tanggal) && tanggal >= minDate && tanggal <= today ? tanggal : today;

  const { data, error } = await db
    .from("attendance_corrections")
    .select("id, tanggal, jam_masuk, jam_pulang, alasan, status, catatan_approval")
    .eq("employee_id", me.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) console.error("KoreksiPage: corrections query failed", error);
  const rows = data ?? [];

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pt-8">
      <RequestTabs active="koreksi" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Ajukan koreksi absensi</h1>
        <p className="text-sm text-muted-foreground">
          Untuk lupa absen, jam yang salah tercatat, atau hari yang tidak terekam. Atasan Anda akan meninjau, dan
          absensi diperbarui setelah disetujui. Maksimal 31 hari ke belakang.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <AttendanceCorrectionForm
          key={prefill}
          action={submitAttendanceCorrection}
          defaults={{ tanggal: prefill }}
          minDate={minDate}
          maxDate={today}
          submitLabel="Kirim pengajuan"
          successMessage="Pengajuan koreksi terkirim ke atasan Anda."
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Riwayat</h2>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>Gagal memuat pengajuan koreksi. Muat ulang halaman.</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} message="Belum ada pengajuan koreksi." />
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <Card size="sm">
                  <CardContent className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{formatTanggal(c.tanggal)}</span>
                      <LeaveStatusBadge status={c.status as LeaveStatus} />
                    </div>
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">Diajukan: </span>
                      <span className="font-mono tabular-nums">
                        {toJakartaHHMM(c.jam_masuk)} – {toJakartaHHMM(c.jam_pulang) ?? "belum pulang"}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">{c.alasan}</p>
                    {c.catatan_approval && (
                      <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Catatan atasan: </span>
                        {c.catatan_approval}
                      </p>
                    )}
                    {c.status === "pending" && (
                      <CancelCorrectionButton action={cancelAttendanceCorrection.bind(null, c.id)} />
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
