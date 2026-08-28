import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InstansiForm } from "./instansi-form";

const DEFAULTS = {
  namaInstansi: "Absensi HR", namaSingkat: "Absensi HR", tagline: null, logoUrl: null,
  alamat: null, telepon: null, email: null, warnaAksen: "#2563EB",
};

describe("InstansiForm", () => {
  it("shows a format error for an invalid accent hex", async () => {
    const user = userEvent.setup();
    render(<InstansiForm defaults={DEFAULTS} saveAppSettings={vi.fn()} uploadLogo={vi.fn()} removeLogo={vi.fn()} />);
    const hex = screen.getByLabelText(/warna aksen/i);
    await user.clear(hex);
    await user.type(hex, "blue");
    expect(await screen.findByText(/#RRGGBB/i)).toBeInTheDocument();
  });

  it("shows a contrast warning for a low-contrast accent", async () => {
    const user = userEvent.setup();
    render(<InstansiForm defaults={DEFAULTS} saveAppSettings={vi.fn()} uploadLogo={vi.fn()} removeLogo={vi.fn()} />);
    const hex = screen.getByLabelText(/warna aksen/i);
    await user.clear(hex);
    await user.type(hex, "#787878");
    expect(await screen.findByText(/kontras rendah/i)).toBeInTheDocument();
  });

  it("submits the text fields to saveAppSettings", async () => {
    const user = userEvent.setup();
    const saveAppSettings = vi.fn().mockResolvedValue({ ok: true });
    render(<InstansiForm defaults={DEFAULTS} saveAppSettings={saveAppSettings} uploadLogo={vi.fn()} removeLogo={vi.fn()} />);
    await user.clear(screen.getByLabelText(/nama instansi/i));
    await user.type(screen.getByLabelText(/nama instansi/i), "PT Contoh");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    const submitted = saveAppSettings.mock.calls[0][0] as FormData;
    expect(submitted.get("nama_instansi")).toBe("PT Contoh");
  });
});
