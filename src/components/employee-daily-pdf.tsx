import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import {
  dailyStatusLabel,
  formatDurasiSingkat,
  formatJamWib,
  keteranganLengkap,
  sumberSingkat,
  summarizeDaily,
  type DailyRow,
} from "@/lib/laporan/employee-daily";

/** Letterhead shared by the attendance PDFs (Pengaturan → Instansi). */
export type PdfOrg = {
  nama: string;
  alamat: string | null;
  /** data: URL — react-pdf can't reliably fetch remote images. */
  logoUrl: string | null;
};

export type EmployeeDailyPdfData = {
  nama: string;
  /** e.g. "Staf · Keuangan · Kantor Pusat" */
  keterangan: string | null;
  /** e.g. "08:00–16:00, Sen–Jum" */
  jadwal: string | null;
  rows: DailyRow[];
};

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function tanggalLabel(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return `${HARI[dt.getUTCDay()]}, ${String(dt.getUTCDate()).padStart(2, "0")} ${BULAN[dt.getUTCMonth()]}`;
}

export function rangeLabel(from: string, to: string): string {
  const f = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`);
    return `${dt.getUTCDate()} ${BULAN[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  };
  return `${f(from)} – ${f(to)}`;
}

const mins = (n: number) => (n > 0 ? `${n} mnt` : "—");

export const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1B1B1F" },
  letterhead: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 8, marginBottom: 12, borderBottom: "1.5px solid #1B1B1F" },
  logo: { width: 34, height: 34, objectFit: "contain" },
  orgName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  orgMeta: { fontSize: 8, color: "#6B6B76", marginTop: 2 },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { color: "#555", marginBottom: 10 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#8A8A93" },
});

const s = StyleSheet.create({
  headRow: { flexDirection: "row", borderBottom: "1px solid #333", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 2.5, borderBottom: "0.5px solid #E4E4E8" },
  muted: { color: "#9A9AA3" },
  absenSekali: { backgroundColor: "#FBDCF0" },
  cTgl: { width: "13%" },
  cStatus: { width: "15%" },
  cJam: { width: "11%", textAlign: "right" },
  sumber: { fontSize: 6.5, color: "#6B6B76" },
  cNum: { width: "11%", textAlign: "right" },
  cKet: { width: "19%", paddingLeft: 16 },
  totals: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10, paddingTop: 6, borderTop: "1px solid #333" },
  totalItem: { flexDirection: "column" },
  totalLabel: { fontSize: 7, color: "#6B6B76" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
});

export function PdfLetterhead({ org }: { org: PdfOrg }) {
  return (
    <View style={pdfStyles.letterhead}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
      {org.logoUrl ? <Image src={org.logoUrl} style={pdfStyles.logo} /> : null}
      <View>
        <Text style={pdfStyles.orgName}>{org.nama}</Text>
        {org.alamat ? <Text style={pdfStyles.orgMeta}>{org.alamat}</Text> : null}
      </View>
    </View>
  );
}

export function PdfFooter({ dicetak }: { dicetak: string }) {
  return (
    <View style={pdfStyles.footer} fixed>
      <Text>Dicetak {dicetak} WIB</Text>
      <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

/** One employee's day-by-day attendance: jam masuk, jam pulang, durasi, and totals. */
export function EmployeeDailyPage({
  org,
  data,
  from,
  to,
  dicetak,
}: {
  org: PdfOrg;
  data: EmployeeDailyPdfData;
  from: string;
  to: string;
  dicetak: string;
}) {
  const sum = summarizeDaily(data.rows);
  return (
    <Page size="A4" style={pdfStyles.page} wrap>
      <PdfLetterhead org={org} />
      <Text style={pdfStyles.title}>Kehadiran Harian — {data.nama}</Text>
      <Text style={pdfStyles.sub}>
        {[data.keterangan, data.jadwal ? `Jadwal ${data.jadwal}` : null, rangeLabel(from, to)].filter(Boolean).join(" · ")}
      </Text>

      <View style={s.headRow} fixed>
        <Text style={s.cTgl}>Tanggal</Text>
        <Text style={s.cStatus}>Status</Text>
        <Text style={s.cJam}>Masuk</Text>
        <Text style={s.cJam}>Pulang</Text>
        <Text style={s.cNum}>Total jam</Text>
        <Text style={s.cNum}>Terlambat</Text>
        <Text style={s.cKet}>Keterangan</Text>
      </View>
      {data.rows.map((r) => {
        const off = r.kind === "bukan_hari_kerja" || r.kind === "libur" || r.kind === "belum_bekerja";
        const ket = [r.shift ? `Shift ${r.shift}` : null, keteranganLengkap(r) || null, r.catatan ? `"${r.catatan}"` : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <View key={r.tanggal} style={[s.row, off ? s.muted : r.absenSekali ? s.absenSekali : {}]} wrap={false}>
            <Text style={s.cTgl}>{tanggalLabel(r.tanggal)}</Text>
            <Text style={s.cStatus}>{dailyStatusLabel(r)}</Text>
            <Text style={s.cJam}>
              {formatJamWib(r.jamMasuk)}
              {r.jamMasuk ? <Text style={s.sumber}>{`\n${sumberSingkat(r.metodeMasuk, r.jamMasuk)}`}</Text> : null}
            </Text>
            <Text style={s.cJam}>
              {formatJamWib(r.jamPulang)}
              {r.jamPulang ? <Text style={s.sumber}>{`\n${sumberSingkat(r.metodePulang, r.jamPulang)}`}</Text> : null}
            </Text>
            <Text style={s.cNum}>{formatDurasiSingkat(r.durasiMenit)}</Text>
            <Text style={s.cNum}>{mins(r.menitTerlambat)}</Text>
            <Text style={s.cKet}>{ket || "—"}</Text>
          </View>
        );
      })}

      <View style={s.totals} wrap={false}>
        {[
          ["Hari kerja", String(sum.hariKerja)],
          ["Hadir", `${sum.hadir} hari`],
          ["Total jam kerja", formatDurasiSingkat(sum.menitKerja)],
          ["Terlambat", `${sum.terlambat}× · ${sum.menitTerlambat} mnt`],
          ["Pulang cepat", String(sum.pulangCepat)],
          ["Alpa", String(sum.alpa)],
          ["Cuti", String(sum.cuti)],
          ...(sum.menitLembur > 0 ? [["Lembur", formatDurasiSingkat(sum.menitLembur)]] : []),
        ].map(([label, value]) => (
          <View key={label} style={s.totalItem}>
            <Text style={s.totalLabel}>{label}</Text>
            <Text style={s.totalValue}>{value}</Text>
          </View>
        ))}
      </View>
      <PdfFooter dicetak={dicetak} />
    </Page>
  );
}

/** Standalone PDF for one employee (Laporan → karyawan → Unduh PDF). */
export function EmployeeDailyDocument(props: {
  org: PdfOrg;
  data: EmployeeDailyPdfData;
  from: string;
  to: string;
  dicetak: string;
}) {
  return (
    <Document title={`Kehadiran ${props.data.nama} ${props.from} s/d ${props.to}`} author={props.org.nama}>
      <EmployeeDailyPage {...props} />
    </Document>
  );
}

/** "18 Nov 2026 09:41" in WIB, for the PDF footer. */
export function printedAt(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${Number(get("day"))} ${BULAN[Number(get("month")) - 1]} ${get("year")} ${get("hour")}:${get("minute")}`;
}
