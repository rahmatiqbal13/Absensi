import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { RecapRow } from "@/lib/laporan/attendance-recap";

export type RecapDocData = {
  branchNama: string;
  from: string;
  to: string;
  rows: RecapRow[];
  orgNama: string;
  orgLogoUrl: string | null;
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  headerLogo: { width: 24, height: 24, objectFit: "contain" },
  headerName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
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
        <View style={styles.header}>
          {data.orgLogoUrl ? <Image src={data.orgLogoUrl} style={styles.headerLogo} /> : null}
          <Text style={styles.headerName}>{data.orgNama}</Text>
        </View>
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
