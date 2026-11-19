import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { REMINDER_JENIS, loadReminderSettings } from "@/lib/attendance/reminder-settings";
import { PengumumanTabs } from "../pengumuman-tabs";
import { ReminderForm } from "./reminder-form";
import { saveReminderSetting } from "./actions";

export const metadata = { title: "Reminder absen" };

export default async function ReminderPage() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  if (me.role !== "hr_admin" && me.role !== "super_admin") redirect("/pengumuman");

  const { settings, migrated } = await loadReminderSettings(db);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <PageHeader
        eyebrow="Informasi"
        title="Pengumuman"
        description="Reminder absen dikirim otomatis ke lonceng notifikasi dan HP karyawan, sesuai jadwal kerja masing-masing."
      />
      <PengumumanTabs active="reminder" />
      {!migrated && (
        <Alert>
          <AlertDescription>
            Pengaturan reminder belum bisa disimpan: jalankan migrasi 0060 di Supabase. Sementara ini reminder
            memakai pengaturan bawaan di bawah.
          </AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        Tidak dikirim di hari libur, tanggal merah, saat cuti, atau sebelum tanggal mulai kerja. Setiap reminder paling
        banyak sekali sehari per karyawan, dan bisa terlambat hingga 5 menit dari waktu yang diatur.
      </p>
      <div className="space-y-4">
        {REMINDER_JENIS.map((jenis) => (
          <ReminderForm key={jenis} setting={settings[jenis]} save={saveReminderSetting} disabled={!migrated} />
        ))}
      </div>
    </div>
  );
}
