import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClockPanel } from "./clock-panel";

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

  it("shows a Clock In button when there is no attendance record yet", () => {
    render(
      <ClockPanel
        todaysAttendance={null}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    expect(screen.getByRole("button", { name: /absen masuk/i })).toBeInTheDocument();
  });

  it("shows a Clock Out button (and today's status) once clocked in but not out", () => {
    render(
      <ClockPanel
        todaysAttendance={{ jamMasuk: "2026-09-01T09:00:00Z", jamPulang: null, status: "tepat_waktu" }}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    expect(screen.getByRole("button", { name: /absen pulang/i })).toBeInTheDocument();
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
  });

  it("shows a completed state once both clock-in and clock-out are recorded", () => {
    render(
      <ClockPanel
        todaysAttendance={{
          jamMasuk: "2026-09-01T09:00:00Z",
          jamPulang: "2026-09-01T17:00:00Z",
          status: "tepat_waktu",
        }}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    expect(screen.queryByRole("button", { name: /absen masuk/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /absen pulang/i })).not.toBeInTheDocument();
    expect(screen.getByText(/absensi hari ini selesai/i)).toBeInTheDocument();
  });

  it("captures geolocation and calls submitClockIn when Absen Masuk is clicked", async () => {
    render(
      <ClockPanel
        todaysAttendance={null}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    await waitFor(() => expect(mockSubmitClockIn).toHaveBeenCalled());
    const formData = mockSubmitClockIn.mock.calls[0][0] as FormData;
    expect(formData.get("lat")).toBe("-6.2");
    expect(formData.get("long")).toBe("106.8");
  });

  it("shows an error message when submitClockIn returns ok: false", async () => {
    mockSubmitClockIn.mockResolvedValue({ ok: false, error: "Anda sudah absen masuk hari ini." });
    render(
      <ClockPanel
        todaysAttendance={null}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    expect(await screen.findByText("Anda sudah absen masuk hari ini.")).toBeInTheDocument();
  });
});
