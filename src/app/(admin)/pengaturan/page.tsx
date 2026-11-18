import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { countActiveSuperAdmins } from "@/lib/employees/super-admin-count";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronRight, AlertTriangle } from "lucide-react";

const HUB = [
  { href: "/pengaturan/instansi", title: "Instansi", desc: "Nama, logo, kontak, dan warna aksen aplikasi.", superOnly: true },
  { href: "/pengaturan/potongan-gaji", title: "Potongan gaji", desc: "Tarif PPh 21 dan potongan hari alpa — semua karyawan atau karyawan tertentu.", superOnly: true },
  { href: "/pengaturan/libur", title: "Hari libur", desc: "Hari libur nasional dan cabang untuk perhitungan payroll." },
  { href: "/pengaturan/audit", title: "Log audit", desc: "Riwayat perubahan data karyawan dan persetujuan cuti." },
  { href: "/pengaturan/departemen", title: "Departemen", desc: "Kelompokkan karyawan per departemen di tiap cabang." },
  { href: "/pengaturan/jadwal", title: "Jadwal kerja", desc: "Jam kerja, hari kerja, dan toleransi keterlambatan per cabang dan departemen." },
  { href: "/pengaturan/shift", title: "Shift & roster", desc: "Shift per cabang dan roster mingguan: siapa masuk shift apa di tanggal berapa." },
  { href: "/pengaturan/cabang", title: "Cabang", desc: "Tambah, ubah nama atau alamat, hapus kantor cabang." },
  { href: "/pengaturan/lokasi", title: "Lokasi kantor", desc: "Titik kantor dan radius geofence per cabang dan departemen." },
];

// Number tiles cycle through the area hues (redesign).
const HUB_TONES = [
  "bg-[#E0E4FF] text-[#3A30B8] dark:bg-primary/20 dark:text-primary",
  "bg-success text-success-foreground",
  "bg-leave text-leave-foreground",
  "bg-info text-info-foreground",
  "bg-warning text-warning-foreground",
  "bg-[#FCE1F0] text-[#9A2A6B] dark:bg-[#3a1530] dark:text-[#f9a8d4]",
  "bg-early text-early-foreground",
];

export default async function PengaturanPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const superAdminCount = await countActiveSuperAdmins(db);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistem" title="Pengaturan" description="Konfigurasi dan status sistem." />

      {superAdminCount === null ? (
        <Alert>
          <AlertDescription>
            Tidak dapat memeriksa jumlah Super Admin aktif saat ini. Silakan muat ulang halaman.
          </AlertDescription>
        </Alert>
      ) : (
        superAdminCount < 2 && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <b>Hanya {superAdminCount} Super Admin aktif.</b> Minimal 2 diperlukan agar
                persetujuan cuti berjenjang untuk HR dan Super Admin tetap berjalan.
              </span>
              {(employee.role === "hr_admin" || employee.role === "super_admin") && (
                <Link
                  href="/karyawan/baru"
                  className="inline-flex h-9 items-center rounded-full border border-current px-3.5 text-[0.85rem] font-semibold"
                >
                  Tambah Super Admin
                </Link>
              )}
            </AlertDescription>
          </Alert>
        )
      )}

      {(employee.role === "hr_admin" || employee.role === "super_admin") && (
        <ul className="grid border-t border-foreground sm:grid-cols-2 sm:gap-x-8">
          {HUB.filter((h) => !h.superOnly || employee.role === "super_admin").map((h, i) => (
            <li key={h.href} className="border-b border-border">
              <Link
                href={h.href}
                className="group grid grid-cols-[44px_1fr_20px] items-start gap-3 py-5.5 pr-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={`ml-2 grid size-8 place-items-center rounded-[9px] font-mono text-[0.8rem] font-semibold ${HUB_TONES[i % HUB_TONES.length]}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[1.05rem] font-semibold">{h.title}</span>
                  <span className="text-[0.85rem] leading-snug text-muted-foreground">{h.desc}</span>
                </span>
                <ChevronRight
                  className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
