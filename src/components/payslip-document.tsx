import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatRupiah } from "@/lib/format/rupiah";
import { terbilangRupiah } from "@/lib/format/terbilang";
import { deductionLines, earningLines, totalPenerimaan, totalPotongan, type PayslipDetail } from "@/lib/payroll/payslip-detail";

export type PayslipOrg = {
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  /** data: URL (react-pdf cannot fetch remote images reliably). */
  logoUrl: string | null;
  /** #RRGGBB */
  aksen: string;
};

const INK = "#1B1B1F";
const MUTED = "#6B6B76";
const LINE = "#E4E4E8";
const SOFT = "#F6F6F8";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9.5, fontFamily: "Helvetica", color: INK },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  org: { flexDirection: "row", gap: 10, maxWidth: 320 },
  logo: { width: 40, height: 40, objectFit: "contain" },
  orgName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  orgMeta: { color: MUTED, marginTop: 2 },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "right", letterSpacing: 1 },
  docPeriod: { textAlign: "right", marginTop: 3, fontSize: 10.5 },
  draft: { textAlign: "right", marginTop: 4, color: "#B42318", fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 1 },
  rule: { height: 2, marginTop: 14, marginBottom: 16 },

  info: { flexDirection: "row", gap: 24, marginBottom: 18 },
  infoCol: { flex: 1 },
  infoRow: { flexDirection: "row", paddingVertical: 2.5 },
  infoLabel: { width: 92, color: MUTED },
  infoValue: { flex: 1, fontFamily: "Helvetica-Bold" },

  cols: { flexDirection: "row", gap: 16 },
  col: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  colHead: { paddingVertical: 6, paddingHorizontal: 10, fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 1, backgroundColor: SOFT },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: LINE },
  lineTotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: INK, fontFamily: "Helvetica-Bold" },
  num: { textAlign: "right" },
  spacer: { flexGrow: 1 },

  net: { marginTop: 16, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 14 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  netLabel: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  netAmount: { fontFamily: "Helvetica-Bold", fontSize: 16 },
  netWords: { marginTop: 5, fontFamily: "Helvetica-Oblique", fontSize: 9 },
  calc: { marginTop: 6, color: MUTED, fontSize: 8.5 },

  sectionTitle: { marginTop: 18, marginBottom: 6, fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 1 },
  stats: { flexDirection: "row", borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  stat: { flex: 1, paddingVertical: 7, paddingHorizontal: 6, borderLeftWidth: 1, borderLeftColor: LINE },
  statFirst: { flex: 1, paddingVertical: 7, paddingHorizontal: 6 },
  statValue: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  statLabel: { color: MUTED, fontSize: 7.5, marginTop: 2 },
  statSub: { color: MUTED, fontSize: 7, marginTop: 1 },
  note: { marginTop: 6, color: MUTED, fontSize: 8 },

  footer: { position: "absolute", left: 40, right: 40, bottom: 24, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 7.5, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
});

function formatTanggal(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function formatWaktuCetak(d: Date): string {
  return `${new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d)} WIB`;
}

export function PayslipDocument({
  slip,
  org,
  printedAt = new Date(),
}: {
  slip: PayslipDetail;
  org: PayslipOrg;
  printedAt?: Date;
}) {
  const r = slip.ringkasan;
  const potongan = deductionLines(slip);
  const contact = [org.alamat, [org.telepon, org.email].filter(Boolean).join(" · ")].filter(Boolean);
  const infoLeft: [string, string][] = [
    ["Nama", slip.karyawan.nama],
    ["Jabatan", slip.karyawan.jabatan],
    ["Departemen", slip.karyawan.departemen ?? "-"],
    ["Cabang", slip.karyawan.cabang],
  ];
  const infoRight: [string, string][] = [
    ["Status kontrak", slip.karyawan.kontrak?.status ?? slip.karyawan.statusKontrak],
    ...(slip.karyawan.kontrak ? [["Periode kontrak", slip.karyawan.kontrak.periode] as [string, string]] : []),
    ["Mulai bekerja", formatTanggal(slip.karyawan.tanggalMulaiKerja)],
    ...(slip.karyawan.masaKerja ? [["Masa kerja", slip.karyawan.masaKerja] as [string, string]] : []),
    ["Hari kerja", `${slip.hariKerjaEfektif} hari`],
    ["Upah harian", formatRupiah(slip.gajiHarian)],
  ];
  const stats: [string, string, string?][] = [
    [String(r.hariDinilai), "Hari dinilai"],
    [String(r.hadir), "Hadir"],
    [String(r.terlambat), "Terlambat", `${r.menitTerlambat} menit`],
    [String(r.pulangCepat), "Pulang cepat", `${r.menitPulangCepat} menit`],
    [String(r.luarKantor), "Di luar lokasi"],
    [String(r.cuti), "Cuti / izin"],
    [String(r.alpa), "Alpa"],
  ];

  return (
    <Document title={`Slip Gaji ${slip.karyawan.nama} ${slip.periode.label}`} author={org.nama}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View style={s.org}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
            {org.logoUrl ? <Image src={org.logoUrl} style={s.logo} /> : null}
            <View>
              <Text style={s.orgName}>{org.nama}</Text>
              {contact.map((c) => (
                <Text key={c} style={s.orgMeta}>{c}</Text>
              ))}
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>SLIP GAJI</Text>
            <Text style={s.docPeriod}>Periode {slip.periode.label}</Text>
            {slip.periode.status !== "final" ? <Text style={s.draft}>DRAF — BELUM FINAL</Text> : null}
          </View>
        </View>
        <View style={[s.rule, { backgroundColor: org.aksen }]} />

        <View style={s.info}>
          {[infoLeft, infoRight].map((col, i) => (
            <View key={i} style={s.infoCol}>
              {col.map(([label, value]) => (
                <View key={label} style={s.infoRow}>
                  <Text style={s.infoLabel}>{label}</Text>
                  <Text style={s.infoValue}>{value}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.colHead}>PENERIMAAN</Text>
            {earningLines(slip).map((p) => (
              <View key={p.label} style={s.line}>
                <Text>{p.label}</Text>
                <Text style={s.num}>{formatRupiah(p.amount)}</Text>
              </View>
            ))}
            <View style={s.spacer} />
            <View style={s.lineTotal}>
              <Text>Total penerimaan</Text>
              <Text style={s.num}>{formatRupiah(totalPenerimaan(slip))}</Text>
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.colHead}>POTONGAN</Text>
            {potongan.map((p) => (
              <View key={p.label} style={s.line}>
                <Text>{p.label}</Text>
                <Text style={s.num}>{formatRupiah(p.amount)}</Text>
              </View>
            ))}
            <View style={s.spacer} />
            <View style={s.lineTotal}>
              <Text>Total potongan</Text>
              <Text style={s.num}>{formatRupiah(totalPotongan(slip))}</Text>
            </View>
          </View>
        </View>

        <View style={[s.net, { backgroundColor: SOFT, borderLeftWidth: 3, borderLeftColor: org.aksen }]}>
          <View style={s.netRow}>
            <Text style={s.netLabel}>Gaji bersih diterima</Text>
            <Text style={s.netAmount}>{formatRupiah(slip.gajiAkhir)}</Text>
          </View>
          <Text style={s.netWords}>Terbilang: {terbilangRupiah(slip.gajiAkhir)}</Text>
          <Text style={s.calc}>
            {`${formatRupiah(totalPenerimaan(slip))} - ${formatRupiah(totalPotongan(slip))} = ${formatRupiah(slip.gajiAkhir)}`}
          </Text>
        </View>

        <Text style={s.sectionTitle}>RINGKASAN KEHADIRAN</Text>
        <View style={s.stats}>
          {stats.map(([value, label, sub], i) => (
            <View key={label} style={i === 0 ? s.statFirst : s.stat}>
              <Text style={s.statValue}>{value}</Text>
              <Text style={s.statLabel}>{label}</Text>
              {sub ? <Text style={s.statSub}>{sub}</Text> : null}
            </View>
          ))}
        </View>
        {r.alpa > 0 && r.potonganAlpa === 0 ? (
          <Text style={s.note}>Hari alpa tercatat, tetapi tidak dipotong dari gaji sesuai kebijakan perusahaan.</Text>
        ) : null}

        <View style={s.footer} fixed>
          <Text>Dicetak {formatWaktuCetak(printedAt)} · Dokumen dibuat otomatis oleh sistem, sah tanpa tanda tangan.</Text>
          <Text>RAHASIA</Text>
        </View>
      </Page>
    </Document>
  );
}
