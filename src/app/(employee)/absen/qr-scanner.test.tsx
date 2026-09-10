import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QrScanner } from "./qr-scanner";

const jsQRMock = vi.hoisted(() => vi.fn());
vi.mock("jsqr", () => ({ default: jsQRMock }));

const VALID_PAYLOAD = "11111111-2222-3333-4444-555555555555|0123456789abcdef";

function installCamera(granted: boolean) {
  const stop = vi.fn();
  const getUserMedia = vi.fn(() =>
    granted
      ? Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream)
      : Promise.reject(new DOMException("no", "NotAllowedError")),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  return { getUserMedia, stop };
}

beforeEach(() => {
  jsQRMock.mockReset();
  // jsdom stubs: <video> has no real dimensions / playback, canvas has no 2d ctx.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 2 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 2 });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })),
  })) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("QrScanner", () => {
  it("renders a 'Buka kamera' button initially", () => {
    installCamera(true);
    render(<QrScanner onDecode={vi.fn()} />);
    expect(screen.getByRole("button", { name: /buka kamera/i })).toBeInTheDocument();
  });

  it("requests the environment-facing camera on click and shows the scanning state", async () => {
    const { getUserMedia } = installCamera(true);
    render(<QrScanner onDecode={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /buka kamera/i }));
    await waitFor(() =>
      expect(screen.getByText(/arahkan ke qr di layar kantor/i)).toBeInTheDocument(),
    );
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } });
  });

  it("calls onDecode once with a payload that matches the kiosk shape, then stops the camera", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { stop } = installCamera(true);
    jsQRMock.mockReturnValue({ data: VALID_PAYLOAD });
    const onDecode = vi.fn();
    render(<QrScanner onDecode={onDecode} />);

    await userEvent.click(screen.getByRole("button", { name: /buka kamera/i }));
    await waitFor(() => expect(screen.getByText(/arahkan ke qr/i)).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(screen.getByText(/qr terbaca/i)).toBeInTheDocument());
    expect(onDecode).toHaveBeenCalledExactlyOnceWith(VALID_PAYLOAD);
    expect(stop).toHaveBeenCalled();
  });

  it("ignores a decoded value that is not a kiosk payload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installCamera(true);
    jsQRMock.mockReturnValue({ data: "https://example.com/not-a-kiosk-qr" });
    const onDecode = vi.fn();
    render(<QrScanner onDecode={onDecode} />);

    await userEvent.click(screen.getByRole("button", { name: /buka kamera/i }));
    await waitFor(() => expect(screen.getByText(/arahkan ke qr/i)).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(600);

    expect(onDecode).not.toHaveBeenCalled();
  });

  it("shows the denied state with a retry button when camera permission is refused", async () => {
    installCamera(false);
    render(<QrScanner onDecode={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /buka kamera/i }));
    await waitFor(() =>
      expect(screen.getByText(/izin kamera ditolak/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /coba lagi/i })).toBeInTheDocument();
  });

  it("calls onReset when 'Scan ulang' is clicked after a decode", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    installCamera(true);
    jsQRMock.mockReturnValue({ data: VALID_PAYLOAD });
    const onReset = vi.fn();
    render(<QrScanner onDecode={vi.fn()} onReset={onReset} />);

    await userEvent.click(screen.getByRole("button", { name: /buka kamera/i }));
    await waitFor(() => expect(screen.getByText(/arahkan ke qr/i)).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(screen.getByText(/qr terbaca/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /scan ulang/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
