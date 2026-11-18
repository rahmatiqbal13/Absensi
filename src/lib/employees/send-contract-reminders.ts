import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { createNotifications, type NewNotification } from "@/lib/notifications/create";
import { paths } from "@/lib/routing/paths";
import {
  CONTRACT_LABEL,
  contractReminderStage,
  daysBetween,
  formatTanggal,
  sortContracts,
  type Contract,
  type ReminderStage,
} from "./contracts";

export type ContractReminderResult = { ok: true; due: number; created: number } | { ok: false; error: string };

/**
 * Daily pass (pg_cron, migration 0049): every active HR admin / super admin
 * gets a bell notification when an active employee's latest contract is 30
 * days from ending, 7 days from ending, and once it has ended without a newer
 * contract. Each stage is sent once per contract (kunci = contract:stage).
 * `db` must be the service-role client.
 */
export async function sendContractReminders(db: SupabaseClient, now = new Date()): Promise<ContractReminderResult> {
  const today = toJakartaDateOnly(now);
  const [empRes, contractRes] = await Promise.all([
    db.from("employees").select("id, nama, slug, role").eq("status", "aktif"),
    db.from("employee_contracts").select("id, employee_id, jenis, tanggal_mulai, tanggal_selesai, catatan"),
  ]);
  if (empRes.error || contractRes.error) {
    console.error("sendContractReminders: query failed", empRes.error ?? contractRes.error);
    return { ok: false, error: "query failed" };
  }
  const employees = (empRes.data ?? []) as { id: string; nama: string; slug: string; role: string }[];
  const hr = employees.filter((e) => e.role === "hr_admin" || e.role === "super_admin");

  const byEmployee = new Map<string, Contract[]>();
  for (const c of (contractRes.data ?? []) as (Contract & { employee_id: string })[]) {
    const list = byEmployee.get(c.employee_id) ?? [];
    list.push(c);
    byEmployee.set(c.employee_id, list);
  }

  const due: { emp: (typeof employees)[number]; contract: Contract; stage: ReminderStage }[] = [];
  for (const emp of employees) {
    const current = sortContracts(byEmployee.get(emp.id) ?? [])[0] ?? null;
    const stage = contractReminderStage(current, today);
    if (current && stage) due.push({ emp, contract: current, stage });
  }

  const rows: NewNotification[] = [];
  for (const { emp, contract, stage } of due) {
    const sisa = daysBetween(today, contract.tanggal_selesai!);
    const jenis = contract.jenis === "magang" ? "Masa magang" : "Kontrak";
    const judul =
      stage === "berakhir"
        ? `${jenis} ${emp.nama} sudah berakhir`
        : `${jenis} ${emp.nama} berakhir ${sisa === 0 ? "hari ini" : `dalam ${sisa} hari`}`;
    const isi =
      `${CONTRACT_LABEL[contract.jenis]} s/d ${formatTanggal(contract.tanggal_selesai!)}. ` +
      (stage === "berakhir"
        ? "Perpanjang kontraknya, atau nonaktifkan akunnya bila tidak dilanjutkan."
        : "Siapkan perpanjangan atau keputusan akhir kontrak.");
    for (const r of hr) {
      rows.push({
        employee_id: r.id,
        jenis: "kontrak",
        kunci: `${contract.id}:${stage}`,
        judul,
        isi,
        link: paths.karyawan(emp.slug),
      });
    }
  }

  const res = await createNotifications(db, rows);
  if (!res.ok) return { ok: false, error: "insert failed" };
  return { ok: true, due: due.length, created: res.created };
}
