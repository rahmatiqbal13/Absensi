import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const settings = {
  namaInstansi: "PT Contoh", namaSingkat: "Contoh", tagline: null,
  logoUrl: null as string | null, alamat: null, telepon: null, email: null, warnaAksen: "#2563EB",
};
vi.mock("@/lib/branding/get-app-settings", () => ({ getAppSettings: async () => settings }));

import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
  it("renders a monogram + name when there is no logo", async () => {
    settings.logoUrl = null;
    render(await BrandMark({}));
    expect(screen.getByText("C")).toBeInTheDocument(); // monogram
    expect(screen.getByText("Contoh")).toBeInTheDocument();
  });

  it("renders the logo image when logoUrl is set", async () => {
    settings.logoUrl = "https://cdn.test/logo.png";
    render(await BrandMark({ showName: false }));
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://cdn.test/logo.png");
    expect(img).toHaveAttribute("alt", "PT Contoh");
  });
});
