"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { decodeMachineFile, parseMachineLog } from "@/lib/mesin/parse-log";
import { applyMachineScans, type DayOutcome, type UnmappedPin } from "@/lib/mesin/apply-scans";
import { COMMAND_TTL_MS, monthWindows } from "@/lib/mesin/commands";
import { detachMachineScans, type DetachResult } from "@/lib/mesin/detach-scans";

export type MachineImportResult =
  | {
      ok: true;
      days: DayOutcome[];
      unmapped: UnmappedPin[];
      scanTotal: number;
      barisDilewati: number;
      scanBaru: number;
      ditulis: number;
    }
  | { ok: false; error: string };

const MAX_BYTES = 1024 * 1024;
const PIN_RE = /^[0-9A-Za-z]{1,20}$/;

async function requireHr() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return null;
  return me;
}

async function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Pilih file log dari mesin." };
  if (file.size > MAX_BYTES) return { ok: false as const, error: "File terlalu besar (maks 1 MB). Ekspor per bulan." };
  const parsed = parseMachineLog(decodeMachineFile(new Uint8Array(await file.arrayBuffer())));
  return parsed;
}

async function run(formData: FormData, dryRun: boolean): Promise<MachineImportResult> {
  const me = await requireHr();
  if (!me) return { ok: false, error: "Hanya HR yang dapat mengimpor data mesin absensi." };
  const parsed = await readFile(formData);
  if (!parsed.ok) return parsed;
  const res = await applyMachineScans(createServiceRoleSupabaseClient(), parsed.scans, {
    sumber: "file",
    actorId: me.id,
    dryRun,
  });
  if (!res.ok) return res;
  if (!dryRun) {
    revalidatePath("/laporan");
    revalidatePath("/dashboard");
    revalidatePath("/pengaturan/mesin-absensi");
  }
  return { ...res, scanTotal: parsed.scans.length, barisDilewati: parsed.skipped };
}

/** Reads the file and shows what would be written, without writing. */
export async function previewMachineFile(formData: FormData): Promise<MachineImportResult> {
  return run(formData, true);
}

/** Stores the raw scans and writes jam masuk / pulang for every mapped employee. */
export async function importMachineFile(formData: FormData): Promise<MachineImportResult> {
  return run(formData, false);
}

/**
 * "Tarik data pegawai dari mesin": queues GET_USER_ID_LIST for the LAN bridge.
 * The page polls until the machine has answered.
 */
export async function requestMachineUsers(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireHr();
  if (!me) return { ok: false, error: "Hanya HR yang dapat menarik data dari mesin." };
  if ((process.env.MESIN_ABSENSI_TOKEN ?? "").length < 24) {
    return { ok: false, error: "Token jembatan (MESIN_ABSENSI_TOKEN) belum diatur di server." };
  }
  const service = createServiceRoleSupabaseClient();
  const { data: active, error: readErr } = await service
    .from("mesin_commands")
    .select("id")
    .is("induk_id", null)
    .eq("cmd_code", "GET_USER_ID_LIST")
    .in("status", ["menunggu", "diambil"])
    .gt("created_at", new Date(Date.now() - COMMAND_TTL_MS).toISOString())
    .limit(1);
  if (readErr) {
    console.error("requestMachineUsers: read failed", readErr);
    return { ok: false, error: "Database belum siap. Jalankan migrasi 0062_mesin_commands.sql." };
  }
  if (active?.length) return { ok: false, error: "Permintaan sebelumnya masih diproses mesin." };

  const { error } = await service.from("mesin_commands").insert({ cmd_code: "GET_USER_ID_LIST", params: {}, diminta_oleh: me.id });
  if (error) {
    console.error("requestMachineUsers: insert failed", error);
    return { ok: false, error: "Gagal membuat permintaan ke mesin." };
  }
  revalidatePath("/pengaturan/mesin-absensi");
  return { ok: true };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONTHS = 36;

/**
 * "Tarik semua absen dari mesin": one GET_LOG_DATA per month in [dari, sampai]
 * (WIB dates), handed to the machine one after another by the LAN bridge. The
 * scans go through the normal path, so re-pulling a period changes nothing.
 */
export async function requestMachineLogs(dari: string, sampai: string): Promise<{ ok: true; bulan: number } | { ok: false; error: string }> {
  const me = await requireHr();
  if (!me) return { ok: false, error: "Hanya HR yang dapat menarik data dari mesin." };
  if ((process.env.MESIN_ABSENSI_TOKEN ?? "").length < 24) {
    return { ok: false, error: "Token jembatan (MESIN_ABSENSI_TOKEN) belum diatur di server." };
  }
  if (!ISO_DATE.test(dari) || !ISO_DATE.test(sampai) || dari > sampai) {
    return { ok: false, error: "Pilih rentang tanggal yang valid." };
  }
  const windows = monthWindows(dari, sampai);
  if (windows.length > MAX_MONTHS) return { ok: false, error: `Maksimal ${MAX_MONTHS} bulan sekali tarik.` };

  const service = createServiceRoleSupabaseClient();
  const { data: active, error: readErr } = await service
    .from("mesin_commands")
    .select("id")
    .eq("cmd_code", "GET_LOG_DATA")
    .in("status", ["menunggu", "diambil"])
    .gt("created_at", new Date(Date.now() - COMMAND_TTL_MS).toISOString())
    .limit(1);
  if (readErr) {
    console.error("requestMachineLogs: read failed", readErr);
    return { ok: false, error: "Database belum siap. Jalankan migrasi 0062_mesin_commands.sql." };
  }
  if (active?.length) return { ok: false, error: "Penarikan absen sebelumnya masih diproses mesin." };

  // Explicit, increasing created_at: the bridge takes the oldest first, so months go in order.
  const t0 = Date.now();
  const { data: root, error } = await service
    .from("mesin_commands")
    .insert({ cmd_code: "GET_LOG_DATA", params: windows[0], diminta_oleh: me.id, created_at: new Date(t0).toISOString() })
    .select("id")
    .single();
  if (error || !root) {
    console.error("requestMachineLogs: insert failed", error);
    return { ok: false, error: "Gagal membuat permintaan ke mesin." };
  }
  if (windows.length > 1) {
    const { error: kidsErr } = await service.from("mesin_commands").insert(
      windows.slice(1).map((w, i) => ({
        cmd_code: "GET_LOG_DATA",
        params: w,
        induk_id: root.id,
        diminta_oleh: me.id,
        created_at: new Date(t0 + i + 1).toISOString(),
      })),
    );
    if (kidsErr) console.error("requestMachineLogs: month inserts failed", kidsErr);
  }
  revalidatePath("/pengaturan/mesin-absensi");
  return { ok: true, bulan: windows.length };
}

export type SetPinResult =
  | { ok: true; diproses: number; dilepas?: { scan: number; hariDihapus: number; hariDiubah: number; hariDilewati: number } }
  | { ok: false; error: string };

/** Links a machine PIN to an employee (or clears it with an empty pin). */
export async function setEmployeePin(
  employeeId: string,
  pin: string,
): Promise<SetPinResult> {
  const me = await requireHr();
  if (!me) return { ok: false, error: "Hanya HR yang dapat mengatur PIN mesin." };
  const value = pin.trim().replace(/^0+(?=\d)/, "");
  if (value && !PIN_RE.test(value)) return { ok: false, error: "PIN hanya boleh angka / huruf, maks 20 karakter." };

  const service = createServiceRoleSupabaseClient();
  const { data: before, error: readErr } = await service
    .from("employees")
    .select("id, nama, pin_mesin")
    .eq("id", employeeId)
    .maybeSingle();
  if (readErr || !before) return { ok: false, error: "Pegawai tidak ditemukan." };

  // Unpairing (or changing) a PIN takes its scans back out of this employee's
  // attendance; they wait unassigned until the PIN is paired with the right person.
  let dilepas: Extract<DetachResult, { ok: true }> | null = null;
  if (value) {
    // Check first: a taken PIN must not leave the old PIN's scans detached.
    const { data: owner } = await service.from("employees").select("nama").eq("pin_mesin", value).neq("id", employeeId).limit(1);
    if (owner?.length) {
      return { ok: false, error: `PIN ${value} sudah dipakai ${owner[0].nama}. Lepaskan dulu dari pegawai tersebut.` };
    }
  }
  if (before.pin_mesin && before.pin_mesin !== value) {
    const d = await detachMachineScans(service, employeeId, before.pin_mesin);
    if (!d.ok) return d;
    dilepas = d;
  }

  const { error } = await service.from("employees").update({ pin_mesin: value || null }).eq("id", employeeId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: `PIN ${value} sudah dipakai pegawai lain.` };
    console.error("setEmployeePin: update failed", error);
    return { ok: false, error: "Gagal menyimpan PIN mesin." };
  }

  // Scans that arrived before this PIN was linked (e.g. from the LAN bridge)
  // now belong to this employee: link them and put them into attendances.
  let diproses = 0;
  if (value) {
    const { data: earlier, error: linkErr } = await service
      .from("mesin_scans")
      .update({ employee_id: employeeId })
      .eq("pin", value)
      .is("employee_id", null)
      .select("pin, waktu, sn");
    if (linkErr) console.error("setEmployeePin: linking earlier scans failed", linkErr);
    if (earlier?.length) {
      const applied = await applyMachineScans(
        service,
        (earlier as { pin: string; waktu: string; sn: string | null }[]).map((s) => ({ pin: s.pin, waktu: s.waktu, sn: s.sn })),
        { sumber: "jaringan", actorId: me.id, dryRun: false, keterangan: `Scan tersimpan diproses setelah PIN ${value} dipasangkan` },
      );
      if (applied.ok) diproses = applied.ditulis;
      else console.error("setEmployeePin: applying earlier scans failed", applied.error);
    }
  }

  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: me.id,
    target_employee_id: employeeId,
    aksi: "employee_pin_mesin_set",
    detail: {
      before: before.pin_mesin ?? null,
      after: value || null,
      ...(dilepas ? { scan_dilepas: dilepas.scanDilepas, hari_dihapus: dilepas.hariDihapus, hari_diubah: dilepas.hariDiubah } : {}),
    },
  });
  if (auditErr) console.error("setEmployeePin: audit insert failed", auditErr);

  revalidatePath("/pengaturan/mesin-absensi");
  if (diproses || dilepas?.scanDilepas) revalidatePath("/laporan");
  return {
    ok: true,
    diproses,
    ...(dilepas
      ? {
          dilepas: {
            scan: dilepas.scanDilepas,
            hariDihapus: dilepas.hariDihapus,
            hariDiubah: dilepas.hariDiubah,
            hariDilewati: dilepas.hariDilewati,
          },
        }
      : {}),
  };
}
