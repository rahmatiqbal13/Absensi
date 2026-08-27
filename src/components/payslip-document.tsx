import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatRupiah } from "@/lib/format/rupiah";

export type PayslipDocData = {
  nama: string;
  branchNama: string;
  periodeLabel: string;
  gajiPokok: number;
  hariKerjaEfektif: number;
  gajiHarian: number;
  totalPotongan: number;
  gajiAkhir: number;
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 4 },
  sub: { color: "#555", marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: "1px solid #eee" },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 8, fontSize: 13 },
});

export function PayslipDocument({ data }: { data: PayslipDocData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Slip Gaji — {data.branchNama}</Text>
        <Text style={styles.sub}>{data.nama} · {data.periodeLabel}</Text>

        <View style={styles.row}><Text>Gaji Pokok</Text><Text>{formatRupiah(data.gajiPokok)}</Text></View>
        <View style={styles.row}><Text>Hari Kerja Efektif</Text><Text>{data.hariKerjaEfektif} hari</Text></View>
        <View style={styles.row}><Text>Gaji Harian</Text><Text>{formatRupiah(data.gajiHarian)}</Text></View>
        <View style={styles.row}><Text>Total Potongan Absensi</Text><Text>- {formatRupiah(data.totalPotongan)}</Text></View>
        <View style={styles.total}><Text>Gaji Akhir</Text><Text>{formatRupiah(data.gajiAkhir)}</Text></View>
      </Page>
    </Document>
  );
}
