import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/location-map", () => ({
  LocationMap: () => <div data-testid="map" />,
}));
// next/dynamic would otherwise wrap the map in Suspense; resolve it eagerly.
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="map" /> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { LocationForm, type BranchLocation } from "./location-form";

const fallbackCenter = { lat: -6.9, lng: 107.6 };

const unconfigured: BranchLocation = {
  id: "b1",
  nama: "Kantor Pusat",
  alamat: "Jl. Merdeka 1",
  lat: 0,
  long: 0,
  radius: 0,
};

const configured: BranchLocation = {
  id: "b2",
  nama: "Cabang Bandung",
  alamat: "Jl. Asia Afrika 8",
  lat: -6.2,
  long: 106.8,
  radius: 100,
};

function setGeo(position: { latitude: number; longitude: number } | Error) {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (
        ok: PositionCallback,
        err?: PositionErrorCallback,
      ) => {
        if (position instanceof Error) err?.(position as unknown as GeolocationPositionError);
        else ok({ coords: position } as GeolocationPosition);
      },
    },
  });
}

describe("LocationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGeo({ latitude: -6.9, longitude: 107.6 });
  });

  it("renders the 'Belum diatur' chip when the branch point is (0,0)", () => {
    render(
      <LocationForm
        branch={unconfigured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={vi.fn()}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    expect(screen.getByText("Belum diatur")).toBeInTheDocument();
  });

  it("renders the 'Aktif' chip with the radius text when configured", () => {
    render(
      <LocationForm
        branch={configured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={vi.fn()}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Aktif · 100 m · ± 1 menit jalan kaki/),
    ).toBeInTheDocument();
  });

  it("keeps Save disabled until the radius changes", () => {
    render(
      <LocationForm
        branch={configured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={vi.fn()}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    const save = screen.getByRole("button", { name: /simpan/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/radius dalam meter/i), {
      target: { value: "150" },
    });
    expect(save).toBeEnabled();
  });

  it("updates the '{n} m' label when the radius number input changes", () => {
    render(
      <LocationForm
        branch={configured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={vi.fn()}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/radius dalam meter/i), {
      target: { value: "250" },
    });
    expect(screen.getByText("250 m")).toBeInTheDocument();
  });

  it("populates the read-only lat/long from a mocked position", () => {
    setGeo({ latitude: -6.914744, longitude: 107.60981 });
    render(
      <LocationForm
        branch={configured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={vi.fn()}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /pakai lokasi saya sekarang/i }),
    );
    expect(screen.getByText("-6.914744, 107.609810")).toBeInTheDocument();
  });

  it("toasts when geolocation fails", () => {
    setGeo(new Error("denied"));
    render(
      <LocationForm
        branch={configured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={vi.fn()}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /pakai lokasi saya sekarang/i }),
    );
    expect(toast.error).toHaveBeenCalledWith("Gagal mengambil lokasi.");
  });

  it("shows the returned error in an Alert when the save fails", async () => {
    const saveBranchLocation = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Radius harus antara 20 dan 5000 meter." });
    render(
      <LocationForm
        branch={configured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={saveBranchLocation}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/radius dalam meter/i), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(
      await screen.findByText("Radius harus antara 20 dan 5000 meter."),
    ).toBeInTheDocument();
  });

  it("submits FormData carrying lat/long/radius on a successful save", async () => {
    const saveBranchLocation = vi.fn().mockResolvedValue({ ok: true });
    render(
      <LocationForm
        branch={configured}
        fallbackCenter={fallbackCenter}
        saveBranchLocation={saveBranchLocation}
        qrEnabled={false}
        kioskUrl={null}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/radius dalam meter/i), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() =>
      expect(saveBranchLocation).toHaveBeenCalledWith("b2", expect.any(FormData)),
    );
    const fd = saveBranchLocation.mock.calls[0][1] as FormData;
    expect(fd.get("lat")).toBe("-6.2");
    expect(fd.get("long")).toBe("106.8");
    expect(fd.get("radius")).toBe("150");
    expect(toast.success).toHaveBeenCalledWith("Lokasi kantor tersimpan.");
  });
});
