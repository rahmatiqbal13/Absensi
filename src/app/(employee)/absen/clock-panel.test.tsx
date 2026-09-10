import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComponentProps } from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClockPanel } from "./clock-panel";

type GeoSummary = {
  status: "prompt" | "watching" | "granted" | "denied" | "unavailable";
  configured: boolean;
  withinRadius: boolean;
  hasFix: boolean;
};

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Mock ProximityPanel so each test can drive the geo summary that ClockPanel
// gates on, without a real geolocation watch.
vi.mock("./proximity-panel", () => ({
  ProximityPanel: ({ onGeoChange }: { onGeoChange: (g: GeoSummary) => void }) => {
    (globalThis as unknown as { __pushGeo: (g: GeoSummary) => void }).__pushGeo = onGeoChange;
    return <div data-testid="proximity" />;
  },
}));

// Mock QrScanner so tests can push a decoded payload without a real camera.
vi.mock("./qr-scanner", () => ({
  QrScanner: ({ onDecode }: { onDecode: (p: string) => void }) => {
    (globalThis as unknown as { __decodeQr: (p: string) => void }).__decodeQr = onDecode;
    return <div data-testid="qr-scanner" />;
  },
}));

function pushGeo(g: GeoSummary) {
  return act(async () => {
    (globalThis as unknown as { __pushGeo: (g: GeoSummary) => void }).__pushGeo(g);
  });
}

function decodeQr(payload: string) {
  return act(async () => {
    (globalThis as unknown as { __decodeQr: (p: string) => void }).__decodeQr(payload);
  });
}

const QR_PAYLOAD = "11111111-2222-3333-4444-555555555555|0123456789abcdef";

const OFFICE = { lat: -6.2, long: 106.8, radius: 100 };
const UNCONFIGURED_OFFICE = { lat: 0, long: 0, radius: 100 };

const IN_RADIUS: GeoSummary = { status: "granted", configured: true, withinRadius: true, hasFix: true };
const OUT_OF_RADIUS: GeoSummary = { status: "granted", configured: true, withinRadius: false, hasFix: true };
const DENIED: GeoSummary = { status: "denied", configured: true, withinRadius: false, hasFix: false };

function attachPhoto() {
  const fileInput = screen.getByLabelText(/foto selfie/i);
  const photo = new File(["x"], "selfie.jpg", { type: "image/jpeg" });
  fireEvent.change(fileInput, { target: { files: [photo] } });
  return photo;
}

describe("ClockPanel", () => {
  const mockSubmitClockIn = vi.fn();
  const mockSubmitClockOut = vi.fn();

  beforeEach(() => {
    mockRefresh.mockReset();
    mockSubmitClockIn.mockReset().mockResolvedValue({ ok: true, status: "tepat_waktu" });
    mockSubmitClockOut.mockReset().mockResolvedValue({ ok: true, status: "tepat_waktu" });
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: -6.2, longitude: 106.8 },
          } as GeolocationPosition),
      },
    });
  });

  function renderPanel(overrides: Partial<ComponentProps<typeof ClockPanel>> = {}) {
    return render(
      <ClockPanel
        todaysAttendance={null}
        office={OFFICE}
        shift={null}
        qrEnabled={false}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
        {...overrides}
      />,
    );
  }

  it("clock-in: submit stays disabled until a photo is attached (in-radius geo)", async () => {
    renderPanel();
    await pushGeo(IN_RADIUS);

    const button = screen.getByRole("button", { name: /absen masuk/i });
    expect(button).toBeDisabled();

    attachPhoto();
    expect(button).not.toBeDisabled();
  });

  it("in-radius: no reason textarea; submit enabled with photo only", async () => {
    renderPanel();
    await pushGeo(IN_RADIUS);

    expect(screen.queryByLabelText(/alasan/i)).not.toBeInTheDocument();
    attachPhoto();
    expect(screen.getByRole("button", { name: /absen masuk/i })).not.toBeDisabled();
  });

  it("out-of-radius: reason textarea appears; submit disabled until reason has text", async () => {
    renderPanel();
    await pushGeo(OUT_OF_RADIUS);

    const textarea = await screen.findByLabelText(/alasan/i);
    expect(textarea).toBeInTheDocument();
    expect(screen.getByText(/di luar radius kantor/i)).toBeInTheDocument();

    attachPhoto();
    const button = screen.getByRole("button", { name: /absen masuk/i });
    expect(button).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Sedang dinas luar" } });
    expect(button).not.toBeDisabled();
  });

  it("denied geo: reason textarea appears with the 'Lokasi tidak terbaca' helper", async () => {
    renderPanel();
    await pushGeo(DENIED);

    expect(await screen.findByLabelText(/alasan/i)).toBeInTheDocument();
    expect(screen.getByText(/lokasi tidak terbaca/i)).toBeInTheDocument();
  });

  it("unconfigured office (0,0): no reason textarea even without a fix; submit enabled with photo only", async () => {
    renderPanel({ office: UNCONFIGURED_OFFICE });
    await pushGeo({ status: "prompt", configured: false, withinRadius: false, hasFix: false });

    expect(screen.queryByLabelText(/alasan/i)).not.toBeInTheDocument();
    attachPhoto();
    expect(screen.getByRole("button", { name: /absen masuk/i })).not.toBeDisabled();
  });

  it("successful clock-in calls submitClockIn with lat/long/photo and catatan when a reason was typed", async () => {
    renderPanel();
    await pushGeo(OUT_OF_RADIUS);

    const photo = attachPhoto();
    const textarea = await screen.findByLabelText(/alasan/i);
    fireEvent.change(textarea, { target: { value: "  Dinas luar  " } });

    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    await waitFor(() => expect(mockSubmitClockIn).toHaveBeenCalled());

    const formData = mockSubmitClockIn.mock.calls[0][0] as FormData;
    expect(formData.get("lat")).toBe("-6.2");
    expect(formData.get("long")).toBe("106.8");
    expect(formData.get("photo")).toBe(photo);
    expect(formData.get("catatan")).toBe("Dinas luar");
  });

  it("stale reason (typed out-of-radius, then moved in-radius) is not sent as catatan", async () => {
    renderPanel();
    await pushGeo(OUT_OF_RADIUS);

    const textarea = await screen.findByLabelText(/alasan/i);
    fireEvent.change(textarea, { target: { value: "Dinas luar" } });

    // User moves into radius before submitting; textarea hides, reason goes stale.
    await pushGeo(IN_RADIUS);
    attachPhoto();

    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    await waitFor(() => expect(mockSubmitClockIn).toHaveBeenCalled());

    const formData = mockSubmitClockIn.mock.calls[0][0] as FormData;
    expect(formData.has("catatan")).toBe(false);
  });

  it("calls router.refresh() after a successful clock-in so the panel advances", async () => {
    renderPanel();
    await pushGeo(IN_RADIUS);
    attachPhoto();

    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    await waitFor(() => expect(mockSubmitClockIn).toHaveBeenCalled());
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("reveals the reason textarea when the server rejects for out-of-radius (client fix looked in-radius)", async () => {
    mockSubmitClockIn.mockResolvedValue({
      ok: false,
      error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
    });
    renderPanel();
    await pushGeo(IN_RADIUS);
    attachPhoto();

    expect(screen.queryByLabelText(/alasan/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));

    expect(await screen.findByLabelText(/alasan/i)).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("in-radius clock-in omits catatan entirely", async () => {
    renderPanel();
    await pushGeo(IN_RADIUS);
    attachPhoto();

    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    await waitFor(() => expect(mockSubmitClockIn).toHaveBeenCalled());

    const formData = mockSubmitClockIn.mock.calls[0][0] as FormData;
    expect(formData.has("catatan")).toBe(false);
  });

  it("shows an error message when submitClockIn returns ok: false", async () => {
    mockSubmitClockIn.mockResolvedValue({ ok: false, error: "Anda sudah absen masuk hari ini." });
    renderPanel();
    await pushGeo(IN_RADIUS);
    attachPhoto();
    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    expect(await screen.findByText("Anda sudah absen masuk hari ini.")).toBeInTheDocument();
  });

  it("clock-out flow (jamMasuk set): renders 'Absen Pulang' and the running-duration text", () => {
    renderPanel({
      todaysAttendance: {
        jamMasuk: new Date(Date.now() - 3 * 60 * 60 * 1000 - 20 * 60 * 1000).toISOString(),
        jamPulang: null,
        status: "tepat_waktu",
      },
    });
    expect(screen.getByRole("button", { name: /absen pulang/i })).toBeInTheDocument();
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
    expect(screen.getByText(/sudah 3j 20m/i)).toBeInTheDocument();
  });

  it("completed flow (jamPulang set): renders the done state + AttendanceStatusBadge, no ProximityPanel", () => {
    renderPanel({
      todaysAttendance: {
        jamMasuk: "2026-09-01T09:00:00Z",
        jamPulang: "2026-09-01T17:00:00Z",
        status: "tepat_waktu",
      },
    });
    expect(screen.queryByRole("button", { name: /absen masuk/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /absen pulang/i })).not.toBeInTheDocument();
    expect(screen.getByText(/absensi hari ini selesai/i)).toBeInTheDocument();
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
    expect(screen.queryByTestId("proximity")).not.toBeInTheDocument();
  });

  it("renders the shift line when a shift is provided", () => {
    renderPanel({ shift: { jamMasuk: "08:00", toleransiMenit: 15 } });
    expect(screen.getByText(/masuk 08:00 · toleransi 15 mnt/i)).toBeInTheDocument();
  });

  describe("QR method", () => {
    it("qrEnabled=false: no method switcher, GPS flow as before", async () => {
      renderPanel({ qrEnabled: false });
      await pushGeo(IN_RADIUS);
      expect(screen.queryByRole("tab", { name: /scan qr/i })).not.toBeInTheDocument();
      expect(screen.getByTestId("proximity")).toBeInTheDocument();
    });

    it("qrEnabled=true: shows a Scan QR / Lokasi GPS switcher, defaults to the scanner and hides the reason field", async () => {
      renderPanel({ qrEnabled: true });
      expect(screen.getByRole("tab", { name: /scan qr/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /lokasi gps/i })).toBeInTheDocument();
      expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
      expect(screen.queryByTestId("proximity")).not.toBeInTheDocument();
      // No reason field ever on the QR method, even with no fix.
      expect(screen.queryByLabelText(/alasan/i)).not.toBeInTheDocument();
    });

    it("QR method: submit disabled until a photo AND a decoded payload", async () => {
      renderPanel({ qrEnabled: true });
      const button = screen.getByRole("button", { name: /absen masuk/i });

      attachPhoto();
      expect(button).toBeDisabled();

      await decodeQr(QR_PAYLOAD);
      expect(screen.getByText(/terverifikasi via qr/i)).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it("QR method: a successful clock-in sends the qrToken in the FormData", async () => {
      renderPanel({ qrEnabled: true });
      attachPhoto();
      await decodeQr(QR_PAYLOAD);

      fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
      await waitFor(() => expect(mockSubmitClockIn).toHaveBeenCalled());

      const fd = mockSubmitClockIn.mock.calls[0][0] as FormData;
      expect(fd.get("qrToken")).toBe(QR_PAYLOAD);
      expect(fd.get("photo")).toBeInstanceOf(File);
    });

    it("QR method: a successful clock-out threads the qrToken in the FormData", async () => {
      renderPanel({
        qrEnabled: true,
        todaysAttendance: {
          jamMasuk: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          jamPulang: null,
          status: "tepat_waktu",
        },
      });
      attachPhoto();
      await decodeQr(QR_PAYLOAD);

      fireEvent.click(screen.getByRole("button", { name: /absen pulang/i }));
      await waitFor(() => expect(mockSubmitClockOut).toHaveBeenCalled());

      const fd = mockSubmitClockOut.mock.calls[0][0] as FormData;
      expect(fd.get("qrToken")).toBe(QR_PAYLOAD);
      expect(fd.get("photo")).toBeInstanceOf(File);
    });

    it("QR method: a server out-of-radius rejection flips to GPS and reveals the reason field", async () => {
      mockSubmitClockIn.mockResolvedValue({
        ok: false,
        error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
      });
      renderPanel({ qrEnabled: true });
      attachPhoto();
      await decodeQr(QR_PAYLOAD);

      expect(screen.queryByLabelText(/alasan/i)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));

      expect(await screen.findByLabelText(/alasan/i)).toBeInTheDocument();
    });

    it("QR method: switching to 'Lokasi GPS' restores the geofence flow", async () => {
      renderPanel({ qrEnabled: true });
      await userEvent.click(screen.getByRole("tab", { name: /lokasi gps/i }));
      await waitFor(() => expect(screen.getByTestId("proximity")).toBeInTheDocument());

      await pushGeo(OUT_OF_RADIUS);
      expect(await screen.findByLabelText(/alasan/i)).toBeInTheDocument();
    });
  });
});
