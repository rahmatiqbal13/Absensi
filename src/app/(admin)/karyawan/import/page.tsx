import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "./import-wizard";
import { previewImport, runImport } from "./actions";

export const metadata = { title: "Import karyawan" };

export default async function ImportKaryawanPage() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  if (me.role !== "hr_admin" && me.role !== "super_admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <Link href="/karyawan" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-text">
        <ChevronLeft className="size-4" aria-hidden="true" /> Karyawan
      </Link>
      <PageHeader
        eyebrow="Orang"
        title="Import karyawan"
        description="Tambah banyak karyawan sekaligus dari file CSV. Setiap karyawan mendapat link untuk mengatur kata sandinya."
        actions={
          <Button asChild variant="outline" size="sm">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a CSV download (route handler), not a page */}
            <a href="/karyawan/import/template" download>
              <Download className="size-4" aria-hidden="true" /> Unduh template
            </a>
          </Button>
        }
      />
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Unduh template, isi di Excel satu baris per karyawan (contoh di baris kedua boleh dihapus).</li>
        <li>Simpan sebagai CSV, lalu pilih file di bawah. Sistem memeriksa setiap baris dulu.</li>
        <li>Klik Impor, lalu unduh daftar link undangan dan kirim ke karyawan.</li>
      </ol>
      <ImportWizard preview={previewImport} run={runImport} />
    </div>
  );
}
