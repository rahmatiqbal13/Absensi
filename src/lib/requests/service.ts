import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentEmployee } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/route-access";
import { resolveApprover } from "@/lib/leave/approver";
import { createNotifications } from "@/lib/notifications/create";
import { JENIS_LABEL, canDecide, type WorkRequestInput, type WorkRequestJenis } from "./work-requests";

type Result = { ok: true } | { ok: false; error: string };

const TGL = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => TGL.format(new Date(`${d}T00:00:00Z`));
export function describeRequest(r: Pick<WorkRequestInput, "jenis" | "tanggal_mulai" | "tanggal_selesai" | "jam_mulai" | "jam_selesai" | "tujuan">): string {
  if (r.jenis === "lembur") return `${fmt(r.tanggal_mulai)}, ${r.jam_mulai?.slice(0, 5)}–${r.jam_selesai?.slice(0, 5)}`;
  const range = r.tanggal_mulai === r.tanggal_selesai ? fmt(r.tanggal_mulai) : `${fmt(r.tanggal_mulai)} – ${fmt(r.tanggal_selesai)}`;
  return `${range} · ${r.tujuan}`;
}

/** Files a request. The approver is resolved here, like leave (atasan, else designated approver). */
export async function submitWorkRequest(service: SupabaseClient, me: CurrentEmployee, v: WorkRequestInput): Promise<Result> {
  const { data: emp, error: empErr } = await service
    .from("employees")
    .select("id, nama, role, atasan_id, designated_approver_id")
    .eq("id", me.id)
    .maybeSingle();
  if (empErr || !emp) return { ok: false, error: "Data karyawan tidak ditemukan." };

  // One open (pending/approved) request of the same kind per overlapping dates.
  const { data: clash } = await service
    .from("work_requests")
    .select("id")
    .eq("employee_id", me.id)
    .eq("jenis", v.jenis)
    .in("status", ["pending", "approved"])
    .lte("tanggal_mulai", v.tanggal_selesai)
    .gte("tanggal_selesai", v.tanggal_mulai)
    .limit(1);
  if (clash?.length) return { ok: false, error: `Sudah ada pengajuan ${JENIS_LABEL[v.jenis].toLowerCase()} pada tanggal itu.` };

  const { approverId } = resolveApprover({
    id: emp.id as string,
    role: emp.role as Role,
    atasanId: (emp.atasan_id as string | null) ?? null,
    designatedApproverId: (emp.designated_approver_id as string | null) ?? null,
  });
  const { data: inserted, error } = await service
    .from("work_requests")
    .insert({ ...v, employee_id: me.id, approver_id: approverId })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("submitWorkRequest: insert failed", error);
    return { ok: false, error: "Gagal mengirim pengajuan." };
  }
  if (approverId) {
    await createNotifications(service, [
      {
        employee_id: approverId,
        jenis: "pengajuan",
        kunci: `${inserted.id}:baru`,
        judul: `Pengajuan ${JENIS_LABEL[v.jenis].toLowerCase()}: ${emp.nama as string}`,
        isi: describeRequest(v),
        link: "/persetujuan-pengajuan",
      },
    ]);
  }
  return { ok: true };
}

export async function decideWorkRequest(
  service: SupabaseClient,
  me: CurrentEmployee,
  id: string,
  approve: boolean,
  catatan: string | null,
): Promise<Result> {
  const { data: req, error } = await service
    .from("work_requests")
    .select("id, employee_id, approver_id, status, jenis, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, tujuan")
    .eq("id", id)
    .maybeSingle();
  if (error || !req) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (!canDecide(me, req as { employee_id: string; approver_id: string | null; status: string })) {
    return { ok: false, error: "Anda tidak berhak memutuskan pengajuan ini." };
  }
  if (!approve && !catatan?.trim()) return { ok: false, error: "Tulis alasan penolakan." };

  const status = approve ? "approved" : "rejected";
  const { data: updated, error: upErr } = await service
    .from("work_requests")
    .update({ status, decided_by: me.id, decided_at: new Date().toISOString(), catatan_approval: catatan?.trim() || null })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (upErr || !updated?.length) return { ok: false, error: "Pengajuan sudah diputuskan sebelumnya." };

  const jenis = req.jenis as WorkRequestJenis;
  await Promise.all([
    service.from("audit_logs").insert({
      actor_id: me.id,
      target_employee_id: req.employee_id,
      aksi: approve ? "work_request_approved" : "work_request_rejected",
      detail: { request_id: id, jenis, tanggal_mulai: req.tanggal_mulai, tanggal_selesai: req.tanggal_selesai, catatan },
    }),
    createNotifications(service, [
      {
        employee_id: req.employee_id as string,
        jenis: "pengajuan",
        kunci: `${id}:${status}`,
        judul: `${JENIS_LABEL[jenis]} ${approve ? "disetujui" : "ditolak"}`,
        isi: describeRequest(req as unknown as WorkRequestInput) + (catatan?.trim() ? ` — ${catatan.trim()}` : ""),
        link: `/pengajuan?jenis=${jenis}`,
      },
    ]),
  ]);
  return { ok: true };
}

/** The requester withdraws a request that is still pending. */
export async function cancelWorkRequest(service: SupabaseClient, me: CurrentEmployee, id: string): Promise<Result> {
  const { data, error } = await service
    .from("work_requests")
    .update({ status: "dibatalkan" })
    .eq("id", id)
    .eq("employee_id", me.id)
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Pengajuan tidak bisa dibatalkan." };
  return { ok: true };
}

/** Approved dinas luar covering `tanggal`, if any (read with the employee's own client). */
export async function activeDinasLuar(db: SupabaseClient, employeeId: string, tanggal: string): Promise<{ tujuan: string } | null> {
  const { data, error } = await db
    .from("work_requests")
    .select("tujuan")
    .eq("employee_id", employeeId)
    .eq("jenis", "dinas_luar")
    .eq("status", "approved")
    .lte("tanggal_mulai", tanggal)
    .gte("tanggal_selesai", tanggal)
    .limit(1)
    .maybeSingle();
  if (error) return null; // pre-0058 or transient: normal geofence rules apply
  return data ? { tujuan: data.tujuan as string } : null;
}
