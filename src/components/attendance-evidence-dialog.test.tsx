import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="map" /> }));

import { AttendanceEvidenceDialog } from "./attendance-evidence-dialog";
import type { EvidenceResult, EvidenceSide } from "@/lib/attendance/evidence";

const side = (over: Partial<EvidenceSide>): EvidenceSide => ({
  jam: "2026-11-18T01:00:00Z",
  metode: "gps",
  lokasi: { lat: -6.2001, lng: 106.8 },
  jarakMeter: 250,
  akurasiMeter: 12,
  flags: [],
  fotoUrl: null,
  fotoStatus: "dihapus",
  ...over,
});

const OK: EvidenceResult = {
  ok: true,
  evidence: {
    tanggal: "2026-11-18",
    status: "di_luar_lokasi",
    catatan: "kunjungan klien",
    kantor: { lat: -6.2, long: 106.8, radius_geofencing_meter: 100, sumber: "cabang" },
    masuk: side({ fotoUrl: "https://signed/masuk.jpg", fotoStatus: "ada", flags: ["akurasi_rendah"] }),
    pulang: side({ jam: null, fotoStatus: "tidak_ada" }),
  },
};

describe("AttendanceEvidenceDialog", () => {
  it("loads only when opened, then shows photo, distance, flags and the note", async () => {
    const load = vi.fn().mockResolvedValue(OK);
    render(<AttendanceEvidenceDialog tanggalLabel="Rab, 18 Nov" load={load} />);
    expect(load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /detail/i }));
    expect(load).toHaveBeenCalledTimes(1);

    expect(await screen.findByAltText("Foto selfie absen masuk")).toHaveAttribute("src", "https://signed/masuk.jpg");
    expect(screen.getByText(/250 m \(di luar radius\)/)).toBeInTheDocument();
    expect(screen.getByText("Akurasi GPS rendah")).toBeInTheDocument();
    expect(screen.getByText("Belum ada absen pulang.")).toBeInTheDocument();
    expect(screen.getByText(/kunjungan klien/)).toBeInTheDocument();
    expect(screen.getByTestId("map")).toBeInTheDocument();
  });

  it("explains a photo removed by the 90-day retention", async () => {
    const load = vi.fn().mockResolvedValue({ ...OK, evidence: { ...OK.evidence, masuk: side({}) } });
    render(<AttendanceEvidenceDialog tanggalLabel="Rab, 18 Nov" load={load} />);
    fireEvent.click(screen.getByRole("button", { name: /detail/i }));
    expect(await screen.findByText(/sudah dihapus otomatis/)).toBeInTheDocument();
  });

  it("shows the server's refusal", async () => {
    const load = vi.fn().mockResolvedValue({ ok: false, error: "Hanya HR yang dapat melihat foto dan lokasi absen." });
    render(<AttendanceEvidenceDialog tanggalLabel="Rab, 18 Nov" load={load} />);
    fireEvent.click(screen.getByRole("button", { name: /detail/i }));
    expect(await screen.findByText(/hanya hr/i)).toBeInTheDocument();
  });
});
