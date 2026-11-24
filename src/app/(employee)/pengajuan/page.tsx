import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";
import { RequestTabs } from "@/components/request-tabs";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { JENIS_LABEL, STATUS_LABEL, type WorkRequestJenis, type WorkRequestStatus } from "@/lib/requests/work-requests";
import { describeRequest } from "@/lib/requests/service";
import { CancelRequestButton, RequestForm } from "./request-form";
import { cancelRequest, submitRequest } from "./actions";

export const metadata = { title: "Pengajuan" };

const BADGE: Record<WorkRequestStatus, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  dibatalkan: "neutral",
};

export default async function PengajuanPage({ searchParams }: { searchParams: Promise<{ jenis?: string }> }) {
  const sp = await searchParams;
  const jenis: WorkRequestJenis = sp.jenis === "dinas_luar" ? "dinas_luar" : "lembur";
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");

  const [listRes, sched] = await Promise.all([
    db
      .from("work_requests")
      .select("id, jenis, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, tujuan, alasan, status, catatan_approval")
      .eq("employee_id", me.id)
      .eq("jenis", jenis)
      .order("tanggal_mulai", { ascending: false })
      .limit(30),
    loadEmployeeSchedule<{ jam_pulang: string }>(db, "jam_pulang", me.branchId, me.departmentId, me.id),
  ]);
  if (listRes.error) console.error("PengajuanPage: list failed", listRes.error);
  const rows = (listRes.data ?? []) as {
    id: string;
    jenis: WorkRequestJenis;
    tanggal_mulai: string;
    tanggal_selesai: string;
    jam_mulai: string | null;
    jam_selesai: string | null;
    tujuan: string | null;
    alasan: string;
    status: WorkRequestStatus;
    catatan_approval: string | null;
  }[];

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pt-8">
      <RequestTabs active={jenis} />
      <h1 className="text-2xl font-semibold text-foreground">Ajukan {JENIS_LABEL[jenis].toLowerCase()}</h1>
      <RequestForm
        key={jenis}
        jenis={jenis}
        today={toJakartaDateOnly(new Date())}
        defaultJamMulai={sched.data?.jam_pulang?.slice(0, 5) ?? "17:00"}
        submit={submitRequest}
      />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Riwayat</h2>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} message={`Belum ada pengajuan ${JENIS_LABEL[jenis].toLowerCase()}.`} />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Card size="sm">
                  <CardContent className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{describeRequest(r)}</span>
                      <Badge variant={BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.alasan}</p>
                    {r.catatan_approval && <p className="text-sm italic text-muted-foreground">“{r.catatan_approval}”</p>}
                    {r.status === "pending" && <CancelRequestButton cancel={cancelRequest.bind(null, r.id)} />}
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
