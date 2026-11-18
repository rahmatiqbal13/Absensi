import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { JENIS_LABEL, type WorkRequestJenis } from "@/lib/requests/work-requests";
import { describeRequest } from "@/lib/requests/service";
import { DecisionForm } from "./decision-form";
import { decideRequest } from "./actions";

export const metadata = { title: "Persetujuan lembur & dinas luar" };

export default async function PersetujuanPengajuanPage() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");

  // HR sees every pending request; an atasan the ones routed to them. Never own.
  let query = db
    .from("work_requests")
    .select(
      "id, jenis, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, tujuan, alasan, created_at, employees!work_requests_employee_id_fkey(nama, jabatan)",
    )
    .eq("status", "pending")
    .neq("employee_id", me.id)
    .order("created_at", { ascending: true });
  if (me.role !== "hr_admin" && me.role !== "super_admin") query = query.eq("approver_id", me.id);
  const { data, error } = await query;
  if (error) console.error("PersetujuanPengajuanPage: query failed", error);

  const rows = (data ?? []) as unknown as {
    id: string;
    jenis: WorkRequestJenis;
    tanggal_mulai: string;
    tanggal_selesai: string;
    jam_mulai: string | null;
    jam_selesai: string | null;
    tujuan: string | null;
    alasan: string;
    employees: { nama: string; jabatan: string | null } | null;
  }[];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kotak masuk"
        title="Persetujuan Lembur & Dinas Luar"
        description="Lembur dibayar hanya bila disetujui. Dinas luar membebaskan absen dari radius kantor pada tanggalnya."
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat pengajuan. Muat ulang halaman.</AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} message="Tidak ada pengajuan yang menunggu." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{r.employees?.nama ?? "Karyawan"}</p>
                      {r.employees?.jabatan && <p className="text-sm text-muted-foreground">{r.employees.jabatan}</p>}
                    </div>
                    <Badge variant={r.jenis === "lembur" ? "warning" : "info"}>{JENIS_LABEL[r.jenis]}</Badge>
                  </div>
                  <p className="text-sm font-medium">{describeRequest(r)}</p>
                  <p className="text-sm text-muted-foreground">{r.alasan}</p>
                  <DecisionForm approve={decideRequest.bind(null, r.id, true)} reject={decideRequest.bind(null, r.id, false)} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
