import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { HistoryList, type AttendanceRecord } from "./history-list";

export default async function RiwayatPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const { data } = await db
    .from("attendances")
    .select("tanggal, jam_masuk, jam_pulang, status, catatan")
    .eq("employee_id", employee.id)
    .order("tanggal", { ascending: false })
    .limit(60);

  const records: AttendanceRecord[] = (data ?? []).map((row) => ({
    tanggal: row.tanggal,
    jamMasuk: row.jam_masuk,
    jamPulang: row.jam_pulang,
    status: row.status,
    catatan: row.catatan,
  }));

  return (
    <main className="p-4">
      <h1 className="mb-4 text-xl font-semibold">Riwayat Absensi</h1>
      <HistoryList records={records} />
    </main>
  );
}
