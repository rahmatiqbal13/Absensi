import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/route-access";
import { resolveApprover } from "@/lib/leave/approver";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";
import { correctedStatus, type ValidCorrection } from "./correction";

// Every function here takes the SERVICE-ROLE client: attendance_corrections has
// no client write policy, and apply_attendance_correction is granted to the
// service role only. Callers must authenticate the user first and pass the
// verified identity in.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const PG_UNIQUE_VIOLATION = "23505";

const RPC_ERRORS: Record<string, string> = {
  "correction not found": "Pengajuan koreksi tidak ditemukan.",
  "correction is not pending": "Pengajuan ini sudah diproses sebelumnya.",
  "self-approval is not allowed": "Anda tidak dapat memproses koreksi absensi Anda sendiri.",
  "payroll period is finalized":
    "Payroll bulan tersebut sudah difinalisasi, jadi absensinya tidak bisa dikoreksi lagi.",
  "catatan is required to reject a correction": "Catatan wajib diisi untuk menolak.",
};

function mapRpcError(message: string | undefined): string {
  const hit = Object.entries(RPC_ERRORS).find(([k]) => message?.includes(k));
  if (!hit) console.error("attendance correction: unmapped RPC error", message);
  return hit?.[1] ?? "Gagal memproses koreksi absensi.";
}

const isHr = (role: Role) => role === "hr_admin" || role === "super_admin";

/** Employee files a correction for one of their own days. */
export async function submitCorrection(
  service: SupabaseClient,
  employeeId: string,
  value: ValidCorrection,
): Promise<Result<{ correctionId: string; approverId: string | null }>> {
  const { data: emp, error: empErr } = await service
    .from("employees")
    .select("id, role, atasan_id, designated_approver_id")
    .eq("id", employeeId)
    .single();
  if (empErr || !emp) {
    console.error("submitCorrection: employee lookup failed", empErr);
    return { ok: false, error: "Data karyawan tidak ditemukan." };
  }
  // Same routing as leave: atasan, or the designated approver for HR / no atasan.
  const { approverId } = resolveApprover({
    id: emp.id,
    role: emp.role,
    atasanId: emp.atasan_id,
    designatedApproverId: emp.designated_approver_id,
  });

  const { data, error } = await service
    .from("attendance_corrections")
    .insert({
      employee_id: employeeId,
      tanggal: value.tanggal,
      jam_masuk: value.jamMasukIso,
      jam_pulang: value.jamPulangIso,
      alasan: value.alasan,
      // Never route a request to its own author; HR's inbox still sees it.
      approver_id: approverId && approverId !== employeeId ? approverId : null,
    })
    .select("id, approver_id")
    .single();
  if (error || !data) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, error: "Sudah ada pengajuan koreksi yang menunggu untuk tanggal ini." };
    }
    console.error("submitCorrection: insert failed", error);
    return { ok: false, error: "Gagal mengajukan koreksi." };
  }
  return { ok: true, correctionId: data.id, approverId: data.approver_id };
}

/** Employee withdraws their own pending correction. */
export async function cancelCorrection(
  service: SupabaseClient,
  employeeId: string,
  correctionId: string,
): Promise<Result> {
  const { data, error } = await service
    .from("attendance_corrections")
    .update({ status: "dibatalkan" })
    .eq("id", correctionId)
    .eq("employee_id", employeeId)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("cancelCorrection: update failed", error);
    return { ok: false, error: "Gagal membatalkan pengajuan." };
  }
  if (!data?.length) return { ok: false, error: "Pengajuan tidak ditemukan atau sudah diproses." };
  return { ok: true };
}

/**
 * Approve or reject a pending correction. Allowed for the assigned approver
 * and for HR; never for the employee themselves (re-checked in the RPC).
 */
export async function decideCorrection(
  service: SupabaseClient,
  decider: { id: string; role: Role },
  correctionId: string,
  approve: boolean,
  catatan: string | null,
): Promise<Result> {
  const { data: corr, error } = await service
    .from("attendance_corrections")
    .select("id, employee_id, approver_id, jam_masuk, jam_pulang, status")
    .eq("id", correctionId)
    .maybeSingle();
  if (error) {
    console.error("decideCorrection: lookup failed", error);
    return { ok: false, error: "Gagal memuat pengajuan koreksi." };
  }
  if (!corr) return { ok: false, error: RPC_ERRORS["correction not found"] };
  if (corr.employee_id === decider.id) return { ok: false, error: RPC_ERRORS["self-approval is not allowed"] };
  if (corr.approver_id !== decider.id && !isHr(decider.role)) {
    return { ok: false, error: "Hanya atasan yang ditunjuk atau HR yang dapat memproses koreksi ini." };
  }

  let status: string | null = null;
  if (approve) {
    const { data: emp } = await service
      .from("employees")
      .select("branch_id, department_id")
      .eq("id", corr.employee_id)
      .single();
    if (!emp) return { ok: false, error: "Data karyawan tidak ditemukan." };
    const { data: schedule, error: schedErr } = await loadEmployeeSchedule<{
      jam_masuk: string;
      jam_pulang: string;
      toleransi_terlambat_menit: number;
    }>(service, "jam_masuk, jam_pulang, toleransi_terlambat_menit", emp.branch_id, emp.department_id);
    if (schedErr || !schedule) {
      if (schedErr) console.error("decideCorrection: schedule lookup failed", schedErr);
      return { ok: false, error: "Jadwal kerja karyawan belum diatur, status tidak bisa dihitung." };
    }
    status = correctedStatus({ jamMasukIso: corr.jam_masuk, jamPulangIso: corr.jam_pulang, schedule });
  }

  const { error: rpcErr } = await service.rpc("apply_attendance_correction", {
    p_correction_id: correctionId,
    p_decider_id: decider.id,
    p_approve: approve,
    p_status: status,
    p_catatan: catatan?.trim() || null,
  });
  if (rpcErr) return { ok: false, error: mapRpcError(rpcErr.message) };
  return { ok: true };
}

/**
 * HR corrects (or fills in) a day directly. Recorded as a correction HR
 * created and approved in one step, so it has the same audit trail.
 */
export async function hrCorrectAttendance(
  service: SupabaseClient,
  hr: { id: string; role: Role },
  employeeId: string,
  value: ValidCorrection,
): Promise<Result> {
  if (!isHr(hr.role)) return { ok: false, error: "Tidak diizinkan." };
  if (employeeId === hr.id) {
    return { ok: false, error: "Absensi Anda sendiri harus diajukan lewat halaman Riwayat dan disetujui orang lain." };
  }

  const { data: inserted, error } = await service
    .from("attendance_corrections")
    .insert({
      employee_id: employeeId,
      tanggal: value.tanggal,
      jam_masuk: value.jamMasukIso,
      jam_pulang: value.jamPulangIso,
      alasan: value.alasan,
      approver_id: hr.id,
      langsung: true,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "Karyawan ini punya pengajuan koreksi yang menunggu untuk tanggal tersebut. Proses dari Persetujuan koreksi.",
      };
    }
    console.error("hrCorrectAttendance: insert failed", error);
    return { ok: false, error: "Gagal menyimpan koreksi." };
  }

  const decided = await decideCorrection(service, hr, inserted.id, true, null);
  if (!decided.ok) {
    // Don't leave HR's own half-done direct correction sitting as "pending".
    const { error: delErr } = await service.from("attendance_corrections").delete().eq("id", inserted.id);
    if (delErr) console.error("hrCorrectAttendance: cleanup failed", delErr);
  }
  return decided;
}
