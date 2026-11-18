import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { RecapRow } from "@/lib/laporan/attendance-recap";
import { formatDurasiSingkat, summarizeDaily, type DailyRow } from "@/lib/laporan/employee-daily";
import { EmployeeDailyPage, PdfFooter, PdfLetterhead, pdfStyles, rangeLabel, type PdfOrg } from "./employee-daily-pdf";

export type RecapDocData = {
  branchNama: string;
  from: string;
  to: string;
  rows: RecapRow[];
  /** Day-by-day rows per employee id; each gets an appendix page. */
  daily: Record<string, DailyRow[]>;
  jadwal: Record<string, string>;
  org: PdfOrg;
  dicetak: string;
};

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", borderBottom: "1px solid #333", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: "1px solid #eee" },
  cNama: { width: "28%" },
  cNum: { width: "9%", textAlign: "right" },
  cJam: { width: "18%", textAlign: "right" },
  note: { marginTop: 10, fontSize: 8, color: "#6B6B76" },
});

/**
 * Laporan kehadiran PDF: a summary page for every employee in the filter,
 * then one day-by-day page per employee (jam masuk, jam pulang, total jam).
 */
export function RecapDocument({ data }: { data: RecapDocData }) {
  const range = rangeLabel(data.from, data.to);
  return (
    <Document title={`Laporan Kehadiran ${data.branchNama} ${data.from} s/d ${data.to}`} author={data.org.nama}>
      <Page size="A4" style={pdfStyles.page} orientation="landscape">
        <PdfLetterhead org={data.org} />
        <Text style={pdfStyles.title}>Laporan Kehadiran — {data.branchNama}</Text>
        <Text style={pdfStyles.sub}>{range}</Text>
        <View style={styles.headRow} fixed>
          <Text style={styles.cNama}>Nama</Text>
          <Text style={styles.cNum}>Hadir</Text>
          <Text style={styles.cNum}>Terlambat</Text>
          <Text style={styles.cNum}>P. Cepat</Text>
          <Text style={styles.cNum}>Luar Lok.</Text>
          <Text style={styles.cNum}>Alpa</Text>
          <Text style={styles.cNum}>Cuti</Text>
          <Text style={styles.cJam}>Total jam kerja</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.employeeId} style={styles.row} wrap={false}>
            <Text style={styles.cNama}>{r.nama}</Text>
            <Text style={styles.cNum}>{r.hadir}</Text>
            <Text style={styles.cNum}>{r.terlambat}</Text>
            <Text style={styles.cNum}>{r.pulangCepat}</Text>
            <Text style={styles.cNum}>{r.diLuarLokasi}</Text>
            <Text style={styles.cNum}>{r.alpa}</Text>
            <Text style={styles.cNum}>{r.cuti}</Text>
            <Text style={styles.cJam}>{formatDurasiSingkat(summarizeDaily(data.daily[r.employeeId] ?? []).menitKerja)}</Text>
          </View>
        ))}
        <Text style={styles.note}>
          Rincian harian (jam masuk, jam pulang, total jam) setiap karyawan ada di halaman berikutnya.
        </Text>
        <PdfFooter dicetak={data.dicetak} />
      </Page>

      {data.rows.map((r) => (
        <EmployeeDailyPage
          key={r.employeeId}
          org={data.org}
          from={data.from}
          to={data.to}
          dicetak={data.dicetak}
          data={{
            nama: r.nama,
            keterangan: data.branchNama,
            jadwal: data.jadwal[r.employeeId] ?? null,
            rows: data.daily[r.employeeId] ?? [],
          }}
        />
      ))}
    </Document>
  );
}
