import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryList } from "./history-list";

describe("HistoryList", () => {
  it("shows an empty state when there are no records", () => {
    render(<HistoryList records={[]} />);
    expect(screen.getByText(/belum ada riwayat absensi/i)).toBeInTheDocument();
  });

  it("renders one row per attendance record with date, times, and status badge", () => {
    render(
      <HistoryList
        records={[
          {
            tanggal: "2026-09-01",
            jamMasuk: "2026-09-01T09:00:00Z",
            jamPulang: "2026-09-01T17:00:00Z",
            status: "tepat_waktu",
            catatan: null,
          },
          {
            tanggal: "2026-09-02",
            jamMasuk: "2026-09-02T09:20:00Z",
            jamPulang: "2026-09-02T17:00:00Z",
            status: "terlambat",
            catatan: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
    expect(screen.getByText("Terlambat")).toBeInTheDocument();
  });

  it("shows the catatan (reason) when present, e.g. for di_luar_lokasi records", () => {
    render(
      <HistoryList
        records={[
          {
            tanggal: "2026-09-01",
            jamMasuk: "2026-09-01T09:00:00Z",
            jamPulang: "2026-09-01T17:00:00Z",
            status: "di_luar_lokasi",
            catatan: "Kunjungan klien di luar kota",
          },
        ]}
      />,
    );
    expect(screen.getByText("Kunjungan klien di luar kota")).toBeInTheDocument();
  });
});
