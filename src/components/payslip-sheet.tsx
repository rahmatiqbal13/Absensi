import { Download } from "lucide-react";
import { formatNomorPegawai } from "@/lib/employees/personal-data";
import { formatRupiah } from "@/lib/format/rupiah";
import { terbilangRupiah } from "@/lib/format/terbilang";
import { deductionLines, earningLines, totalPenerimaan, totalPotongan, type PayslipDetail } from "@/lib/payroll/payslip-detail";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatTanggal(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function Money({ value, className }: { value: number; className?: string }) {
  return <span className={`font-mono tabular-nums ${className ?? ""}`}>{formatRupiah(value)}</span>;
}

/** The payslip as a document-like web view. Same content as the PDF. */
export async function PayslipSheet({ slip, pdfHref }: { slip: PayslipDetail; pdfHref: string }) {
  const org = await getAppSettings();
  const r = slip.ringkasan;
  const potongan = deductionLines(slip);
  const contact = [org.alamat, [org.telepon, org.email].filter(Boolean).join(" · ")].filter(Boolean);

  const info: [string, string][] = [
    ["Nama", slip.karyawan.nama],
    ...(slip.karyawan.nomorPegawai ? [["No. pegawai", formatNomorPegawai(slip.karyawan.nomorPegawai)!] as [string, string]] : []),
    ["Jabatan", slip.karyawan.jabatan],
    ["Departemen", slip.karyawan.departemen ?? "-"],
    ["Cabang", slip.karyawan.cabang],
    ["Status kontrak", slip.karyawan.kontrak?.status ?? slip.karyawan.statusKontrak],
    ...(slip.karyawan.kontrak ? [["Periode kontrak", slip.karyawan.kontrak.periode] as [string, string]] : []),
    ["Mulai bekerja", formatTanggal(slip.karyawan.tanggalMulaiKerja)],
    ...(slip.karyawan.masaKerja ? [["Masa kerja", slip.karyawan.masaKerja] as [string, string]] : []),
    ["Hari kerja", `${slip.hariKerjaEfektif} hari`],
    ["Upah harian", formatRupiah(slip.gajiHarian)],
  ];

  const stats: [string, string][] = [
    ["Hari dinilai", String(r.hariDinilai)],
    ["Hadir", String(r.hadir)],
    ["Terlambat", `${r.terlambat} · ${r.menitTerlambat} mnt`],
    ["Pulang cepat", `${r.pulangCepat} · ${r.menitPulangCepat} mnt`],
    ["Di luar lokasi", String(r.luarKantor)],
    ["Cuti / izin", String(r.cuti)],
    ["Alpa", String(r.alpa)],
  ];

  return (
    <article
      aria-label={`Slip gaji ${slip.karyawan.nama} ${slip.periode.label}`}
      className="overflow-hidden rounded-[18px] bg-card text-card-foreground ring-1 ring-border"
    >
      <div className="h-1.5 bg-brand" aria-hidden="true" />

      <header className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-7">
        <div className="flex min-w-0 items-start gap-3">
          {org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="size-11 shrink-0 rounded-lg object-contain" />
          )}
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{org.namaInstansi}</p>
            {contact.map((c) => (
              <p key={c} className="text-xs leading-relaxed text-muted-foreground">{c}</p>
            ))}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground">SLIP GAJI</p>
          <p className="text-lg font-semibold text-foreground">{slip.periode.label}</p>
          {slip.periode.status !== "final" && (
            <Badge variant="warning" className="mt-1">Draf — belum final</Badge>
          )}
          {slip.periode.status === "final" && slip.periode.dibayarPada && (
            <Badge variant="success" className="mt-1">
              Dibayar {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${slip.periode.dibayarPada}T00:00:00Z`))}
            </Badge>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border px-5 py-5 text-sm sm:grid-cols-2 sm:px-7">
        {info.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 px-5 sm:grid-cols-2 sm:px-7">
        <section aria-labelledby="slip-penerimaan" className="flex flex-col rounded-xl ring-1 ring-border">
          <h2 id="slip-penerimaan" className="rounded-t-xl bg-muted/60 px-4 py-2.5 text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground">
            PENERIMAAN
          </h2>
          {earningLines(slip).map((p) => (
            <div key={p.label} className="flex justify-between gap-3 border-t border-border px-4 py-2.5 text-sm">
              <span>{p.label}</span>
              <Money value={p.amount} />
            </div>
          ))}
          <div className="mt-auto flex justify-between gap-3 border-t border-foreground/80 px-4 py-3 text-sm font-semibold">
            <span>Total penerimaan</span>
            <Money value={totalPenerimaan(slip)} />
          </div>
        </section>

        <section aria-labelledby="slip-potongan" className="flex flex-col rounded-xl ring-1 ring-border">
          <h2 id="slip-potongan" className="rounded-t-xl bg-muted/60 px-4 py-2.5 text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground">
            POTONGAN
          </h2>
          {potongan.map((p) => (
            <div key={p.label} className="flex justify-between gap-3 border-t border-border px-4 py-2.5 text-sm">
              <span>{p.label}</span>
              <Money value={p.amount} className={p.amount > 0 ? "text-destructive" : "text-muted-foreground"} />
            </div>
          ))}
          <div className="mt-auto flex justify-between gap-3 border-t border-foreground/80 px-4 py-3 text-sm font-semibold">
            <span>Total potongan</span>
            <Money value={totalPotongan(slip)} />
          </div>
        </section>
      </div>

      <section
        aria-label="Gaji bersih"
        className="mx-5 mt-4 rounded-xl border-l-4 border-brand bg-muted/60 px-4 py-4 sm:mx-7"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-foreground">Gaji bersih diterima</span>
          <Money value={slip.gajiAkhir} className="text-2xl font-semibold text-foreground" />
        </div>
        <p className="mt-1 text-sm italic text-muted-foreground">Terbilang: {terbilangRupiah(slip.gajiAkhir)}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
          {formatRupiah(totalPenerimaan(slip))} − {formatRupiah(totalPotongan(slip))} = {formatRupiah(slip.gajiAkhir)}
        </p>
      </section>

      <section aria-labelledby="slip-kehadiran" className="px-5 pt-5 pb-6 sm:px-7">
        <h2 id="slip-kehadiran" className="mb-2 text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground">
          RINGKASAN KEHADIRAN
        </h2>
        <dl className="grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-border sm:grid-cols-4 lg:grid-cols-7">
          {stats.map(([k, v]) => (
            <div key={k} className="flex flex-col-reverse border-b border-border p-3 odd:border-r sm:border-r lg:border-b-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-mono text-base font-semibold text-foreground tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {r.alpa > 0 && r.potonganAlpa === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Hari alpa tercatat, tetapi tidak dipotong dari gaji sesuai kebijakan perusahaan.
          </p>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-4 sm:px-7">
        <p className="text-xs text-muted-foreground">Dokumen dibuat otomatis oleh sistem · Rahasia</p>
        <Button asChild variant="brand" className="h-11 px-4">
          <a href={pdfHref}>
            <Download className="size-4" /> Unduh PDF
          </a>
        </Button>
      </footer>
    </article>
  );
}
