import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { countActiveSuperAdmins } from "@/lib/employees/super-admin-count";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  Network,
  Clock,
  CalendarOff,
  ScrollText,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function HubCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="block">
      <Card size="sm" className="transition-colors hover:bg-muted/40">
        <CardContent className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </div>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function PengaturanPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const superAdminCount = await countActiveSuperAdmins(db);

  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" description="Konfigurasi dan status sistem." />

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
            <AlertDescription>
              Peringatan: sistem ini hanya memiliki {superAdminCount} Super Admin aktif. Minimal 2
              Super Admin diperlukan agar mekanisme persetujuan cuti berjenjang untuk HR/Super Admin
              tetap berfungsi. Tambahkan Super Admin lain sesegera mungkin.
            </AlertDescription>
          </Alert>
        )
      )}

      {(employee.role === "hr_admin" || employee.role === "super_admin") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {employee.role === "super_admin" && (
            <HubCard
              href="/pengaturan/instansi"
              icon={Building2}
              title="Instansi"
              desc="Nama, logo, kontak, dan warna aksen aplikasi."
            />
          )}
          <HubCard href="/pengaturan/libur" icon={CalendarOff} title="Hari Libur"
            desc="Kelola hari libur nasional & cabang untuk perhitungan payroll." />
          <HubCard href="/pengaturan/audit" icon={ScrollText} title="Log Audit"
            desc="Riwayat perubahan data karyawan & persetujuan cuti." />
          <HubCard href="/pengaturan/departemen" icon={Network} title="Departemen"
            desc="Kelompokkan karyawan per departemen di tiap cabang." />
          <HubCard href="/pengaturan/jadwal" icon={Clock} title="Jadwal Kerja"
            desc="Jam kerja, hari kerja, dan toleransi keterlambatan per cabang." />
        </div>
      )}
    </div>
  );
}
