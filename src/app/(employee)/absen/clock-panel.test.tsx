import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComponentProps } from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClockPanel } from "./clock-panel";

type GeoSummary = {
  status: "prompt" | "watching" | "granted" | "denied" | "unavailable";
  configured: boolean;
  withinRadius: boolean;
  hasFix: boolean;
};

// Mock ProximityPanel so each test can drive the geo summary that ClockPanel
// gates on, without a real geolocation watch.
vi.mock("./proximity-panel", () => ({
  ProximityPanel: ({ onGeoChange }: { onGeoChange: (g: GeoSummary) => void }) => {
    (globalThis as unknown as { __pushGeo: (g: GeoSummary) => void }).__pushGeo = onGeoChange;
    return <div data-testid="proximity" />;
  },
}));

function pushGeo(g: GeoSummary) {
  return act(async () => {
    (globalThis as unknown as { __pushGeo: (g: GeoSummary) => void }).__pushGeo(g);
  });
}

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
});
