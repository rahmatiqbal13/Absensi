"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { decodeMachineFile, parseMachineLog } from "@/lib/mesin/parse-log";
import { applyMachineScans, type DayOutcome, type UnmappedPin } from "@/lib/mesin/apply-scans";

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

/** Links a machine PIN to an employee (or clears it with an empty pin). */
export async function setEmployeePin(
  employeeId: string,
  pin: string,
): Promise<{ ok: true; diproses: number } | { ok: false; error: string }> {
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
    detail: { before: before.pin_mesin ?? null, after: value || null },
  });
  if (auditErr) console.error("setEmployeePin: audit insert failed", auditErr);

  revalidatePath("/pengaturan/mesin-absensi");
  if (diproses) revalidatePath("/laporan");
  return { ok: true, diproses };
}
