import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Network } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { MesinImport } from "./mesin-import";
import { PinTable } from "./pin-table";
import { importMachineFile, previewMachineFile, setEmployeePin } from "./actions";

export const metadata = { title: "Mesin absensi" };

const waktuFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta" });

export default async function MesinAbsensiPage() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  if (me.role !== "hr_admin" && me.role !== "super_admin") redirect("/dashboard");

  const [empRes, lastLan, pendingLan] = await Promise.all([
    db.from("employees").select("id, nama, pin_mesin").eq("status", "aktif").order("nama"),
    db.from("mesin_scans").select("created_at, sn").eq("sumber", "jaringan").order("created_at", { ascending: false }).limit(1),
    db.from("mesin_scans").select("pin").is("employee_id", null).limit(1000),
  ]);
  const notMigrated = !!empRes.error;
  const employees = ((empRes.data ?? []) as { id: string; nama: string; pin_mesin: string | null }[]).map((e) => ({
    id: e.id,
    nama: e.nama,
    pin: e.pin_mesin,
  }));
  const tokenSet = (process.env.MESIN_ABSENSI_TOKEN ?? "").length >= 24;
  const last = (lastLan.data?.[0] ?? null) as { created_at: string; sn: string | null } | null;
  const orphanPins = [...new Set(((pendingLan.data ?? []) as { pin: string }[]).map((p) => p.pin))];

  return (
    <div className="space-y-8">
      <Link href="/pengaturan" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-text">
        <ChevronLeft className="size-4" aria-hidden="true" /> Pengaturan
      </Link>
      <PageHeader
        eyebrow="Sistem"
        title="Mesin absensi"
        description="Masukkan absen dari mesin fingerprint (Fingerspot Revo) — lewat file dari flashdisk atau otomatis lewat jaringan kantor. Jam masuk = scan pertama, jam pulang = scan terakhir di hari itu."
      />

      {notMigrated && (
        <Alert variant="destructive">
          <AlertDescription>
            Database belum siap untuk mesin absensi. Jalankan migrasi <span className="font-mono">0061_machine_attendance.sql</span> dulu.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Impor file dari mesin</h2>
        <MesinImport preview={previewMachineFile} run={importMachineFile} setPin={setEmployeePin} employees={employees} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. PIN pegawai di mesin</h2>
        <p className="text-sm text-muted-foreground">
          Isi dengan nomor ID / PIN pegawai yang terdaftar di mesin (kolom EnNo). Absen hanya masuk untuk pegawai yang PIN-nya diisi.
          Absen yang dikoreksi HR tidak pernah ditimpa data mesin.
        </p>
        <PinTable employees={employees} setPin={setEmployeePin} />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Network className="size-5" aria-hidden="true" /> 3. Tarik otomatis lewat jaringan kantor
        </h2>
        <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            Token jembatan:{" "}
            {tokenSet ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Belum diatur</Badge>}
            {last ? (
              <span className="text-muted-foreground">
                · Data terakhir diterima {waktuFmt.format(new Date(last.created_at))}
                {last.sn ? ` dari mesin ${last.sn}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">· Belum ada data dari jaringan</span>
            )}
          </p>
          {orphanPins.length > 0 && (
            <p className="text-warning-foreground">
              Ada scan tersimpan dari PIN yang belum dipasangkan: <span className="font-mono">{orphanPins.join(", ")}</span>. Isi PIN-nya
              di tabel di atas; scan tersebut langsung dimasukkan ke absensi.
            </p>
          )}
          <p className="text-muted-foreground">
            Aplikasi berjalan di internet, jadi tidak bisa menjangkau mesin di jaringan kantor secara langsung. Program kecil
            <span className="font-mono"> mesin-bridge</span> di satu PC kantor (satu jaringan / Wi-Fi dengan mesin) membaca scan dari
            mesin lalu mengirimnya ke sini. Panduan pemasangan ada di <span className="font-mono">scripts/mesin-bridge/README.md</span>.
          </p>
        </div>
      </section>
    </div>
  );
}
