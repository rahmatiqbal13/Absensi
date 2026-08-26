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

  it("renders times in Asia/Jakarta wall-clock, not the process's local timezone", () => {
    // 2026-09-01T02:00:00.000Z is 09:00 WIB (UTC+7). Regression test for a bug
    // where `formatTime` omitted the `timeZone` option, so it rendered the
    // instant in whatever timezone the executing (server) process happened to
    // use — e.g. "02.00" on a UTC-default deployment instead of "09.00" WIB.
    render(
      <HistoryList
        records={[
          {
            tanggal: "2026-09-01",
            jamMasuk: "2026-09-01T02:00:00.000Z",
            jamPulang: "2026-09-01T10:00:00.000Z",
            status: "tepat_waktu",
            catatan: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("09.00 – 17.00")).toBeInTheDocument();
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
