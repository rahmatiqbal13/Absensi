import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { BranchQrSection } from "./branch-qr-section";

const writeText = vi.fn().mockResolvedValue(undefined);

const baseProps = {
  branchId: "b1",
  qrEnabled: false,
  kioskUrl: null as string | null,
  setBranchQr: vi.fn().mockResolvedValue({ ok: true }),
  resetKioskKey: vi.fn().mockResolvedValue({ ok: true }),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

describe("BranchQrSection", () => {
  it("renders the toggle unchecked and hides the kiosk link when QR is off", () => {
    render(
      <BranchQrSection
        {...baseProps}
        setBranchQr={vi.fn()}
        resetKioskKey={vi.fn()}
      />,
    );
    const cb = screen.getByLabelText("Aktifkan Absen QR") as HTMLInputElement;
    expect(cb.checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Salin link" })).toBeNull();
  });

  it("calls setBranchQr with a truthy 'enabled' and toasts on success when toggled on", async () => {
    const setBranchQr = vi.fn().mockResolvedValue({ ok: true });
    render(<BranchQrSection {...baseProps} setBranchQr={setBranchQr} />);
    fireEvent.click(screen.getByLabelText("Aktifkan Absen QR"));
    await waitFor(() =>
      expect(setBranchQr).toHaveBeenCalledWith("b1", expect.any(FormData)),
    );
    const fd = setBranchQr.mock.calls[0][1] as FormData;
    expect(fd.get("enabled")).toBeTruthy();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Absen QR diaktifkan."),
    );
  });

  it("shows the kiosk URL and wires Salin link / Buka kiosk / Ganti link & kode QR when QR is on", async () => {
    const resetKioskKey = vi.fn().mockResolvedValue({ ok: true });
    const url = "https://hr.example.com/kiosk/abc123";
    render(
      <BranchQrSection
        {...baseProps}
        qrEnabled
        kioskUrl={url}
        resetKioskKey={resetKioskKey}
      />,
    );

    expect(screen.getByText(url)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salin link" }));
    expect(writeText).toHaveBeenCalledWith(url);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Link disalin."),
    );

    const open = screen.getByRole("link", { name: /Buka kiosk/ });
    expect(open).toHaveAttribute("href", url);
    expect(open).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("button", { name: "Ganti link & kode QR" }));
    await waitFor(() => expect(resetKioskKey).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Link kiosk & kode QR baru dibuat. Perbarui layar kiosk.",
      ),
    );
  });

  it("toasts the returned error when setBranchQr fails", async () => {
    const setBranchQr = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Gagal menyimpan pengaturan Absen QR." });
    render(<BranchQrSection {...baseProps} setBranchQr={setBranchQr} />);
    fireEvent.click(screen.getByLabelText("Aktifkan Absen QR"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Gagal menyimpan pengaturan Absen QR.",
      ),
    );
  });

  it("reverts the checkbox to the server state when setBranchQr fails", async () => {
    const setBranchQr = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Gagal menyimpan pengaturan Absen QR." });
    render(<BranchQrSection {...baseProps} qrEnabled={false} setBranchQr={setBranchQr} />);
    const cb = screen.getByLabelText("Aktifkan Absen QR") as HTMLInputElement;
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
    await waitFor(() => expect(cb.checked).toBe(false));
  });

  it("toasts a failure when the clipboard write rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const url = "https://hr.example.com/kiosk/abc123";
    render(<BranchQrSection {...baseProps} qrEnabled kioskUrl={url} />);
    fireEvent.click(screen.getByRole("button", { name: "Salin link" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Gagal menyalin link."),
    );
  });
});
