import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { RecapRow } from "@/lib/laporan/attendance-recap";

export type RecapDocData = { branchNama: string; from: string; to: string; rows: RecapRow[] };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 14, marginBottom: 2 },
  sub: { color: "#555", marginBottom: 12 },
  headRow: { flexDirection: "row", borderBottom: "1px solid #333", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: "1px solid #eee" },
  cNama: { width: "28%" },
  cNum: { width: "12%", textAlign: "right" },
});

export function RecapDocument({ data }: { data: RecapDocData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        <Text style={styles.title}>Laporan Kehadiran — {data.branchNama}</Text>
        <Text style={styles.sub}>{data.from} s/d {data.to}</Text>
        <View style={styles.headRow}>
          <Text style={styles.cNama}>Nama</Text>
          <Text style={styles.cNum}>Hadir</Text>
          <Text style={styles.cNum}>Terlambat</Text>
          <Text style={styles.cNum}>P. Cepat</Text>
          <Text style={styles.cNum}>Luar Lok.</Text>
          <Text style={styles.cNum}>Alpa</Text>
          <Text style={styles.cNum}>Cuti</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.employeeId} style={styles.row}>
            <Text style={styles.cNama}>{r.nama}</Text>
            <Text style={styles.cNum}>{r.hadir}</Text>
            <Text style={styles.cNum}>{r.terlambat}</Text>
            <Text style={styles.cNum}>{r.pulangCepat}</Text>
            <Text style={styles.cNum}>{r.diLuarLokasi}</Text>
            <Text style={styles.cNum}>{r.alpa}</Text>
            <Text style={styles.cNum}>{r.cuti}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
