import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getKioskQr = vi.fn();
vi.mock("./actions", () => ({ getKioskQr: () => getKioskQr() }));

import { KioskDisplay } from "./kiosk-display";

const OK = {
  ok: true as const,
  dataUrl: "data:image/png;base64,AAAA",
  remainingMs: 30_000,
};

beforeEach(() => {
  getKioskQr.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KioskDisplay", () => {
  it("switches to the inactive state after 3 consecutive { ok: false } responses", async () => {
    getKioskQr.mockResolvedValue({ ok: false });
    render(<KioskDisplay kioskKey="k" branchNama="Kantor" />);

    // 1st failure resolves on mount; 2nd and 3rd after the 5s retry each.
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() =>
      expect(screen.getByText("Kiosk tidak aktif.")).toBeInTheDocument(),
    );
  });

  it("keeps the last QR on a thrown/network error and does not go inactive", async () => {
    getKioskQr.mockResolvedValueOnce(OK).mockRejectedValue(new Error("network"));
    render(<KioskDisplay kioskKey="k" branchNama="Kantor" />);

    await waitFor(() =>
      expect(screen.getByRole("img", { name: /qr absen/i })).toBeInTheDocument(),
    );

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    expect(screen.getByRole("img", { name: /qr absen/i })).toBeInTheDocument();
    expect(screen.queryByText("Kiosk tidak aktif.")).not.toBeInTheDocument();
  });
});
