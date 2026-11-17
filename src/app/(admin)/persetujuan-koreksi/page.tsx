import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CorrectionApprovalList, type PendingCorrection } from "./correction-approval-list";
import { approveCorrection, rejectCorrection } from "./actions";

export default async function PersetujuanKoreksiPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: highlightId } = await searchParams;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");

  const header = (
    <PageHeader
      eyebrow="Kotak masuk"
      title="Persetujuan Koreksi Absensi"
      description="Tinjau pengajuan koreksi jam masuk/pulang. Setelah disetujui, absensi dan statusnya diperbarui otomatis."
    />
  );

  // Same visibility as the leave inbox: HR sees every pending request, an
  // atasan only the ones routed to them. Own requests are never decidable.
  let query = db
    .from("attendance_corrections")
    .select(
      "id, employee_id, tanggal, jam_masuk, jam_pulang, alasan, created_at, employees!attendance_corrections_employee_id_fkey(nama, jabatan)",
    )
    .eq("status", "pending")
    .neq("employee_id", me.id)
    .order("created_at", { ascending: true });
  if (me.role !== "hr_admin" && me.role !== "super_admin") query = query.eq("approver_id", me.id);

  const { data, error } = await query;
  if (error) {
    console.error("PersetujuanKoreksiPage: corrections query failed", error);
    return (
      <div className="space-y-4">
        {header}
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat pengajuan koreksi. Silakan muat ulang halaman.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    employee_id: string;
    tanggal: string;
    jam_masuk: string;
    jam_pulang: string | null;
    alasan: string;
    employees: { nama: string; jabatan: string | null } | null;
  }>;

  // What is on record today for each requested day, to show before -> after.
  const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
  const dates = [...new Set(rows.map((r) => r.tanggal))];
  const current = new Map<string, { jam_masuk: string | null; jam_pulang: string | null; status: string }>();
  if (rows.length) {
    const { data: att, error: attErr } = await db
      .from("attendances")
      .select("employee_id, tanggal, jam_masuk, jam_pulang, status")
      .in("employee_id", employeeIds)
      .in("tanggal", dates);
    if (attErr) console.error("PersetujuanKoreksiPage: attendances lookup failed", attErr);
    for (const a of att ?? []) current.set(`${a.employee_id}|${a.tanggal}`, a);
  }

  const requests: PendingCorrection[] = rows.map((r) => {
    const cur = current.get(`${r.employee_id}|${r.tanggal}`);
    return {
      id: r.id,
      employeeName: r.employees?.nama ?? "Karyawan",
      jabatan: r.employees?.jabatan ?? null,
      tanggal: r.tanggal,
      proposed: { jamMasuk: r.jam_masuk, jamPulang: r.jam_pulang },
      current: cur ? { jamMasuk: cur.jam_masuk, jamPulang: cur.jam_pulang, status: cur.status } : null,
      alasan: r.alasan,
    };
  });

  return (
    <div className="space-y-6">
      {header}
      <CorrectionApprovalList
        requests={requests}
        highlightId={highlightId}
        approve={approveCorrection}
        reject={rejectCorrection}
      />
    </div>
  );
}
