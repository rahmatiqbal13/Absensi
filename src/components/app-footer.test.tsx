import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CREDIT } from "@/lib/branding/credit";

const settings = {
  namaInstansi: "PT Contoh", namaSingkat: "Contoh", tagline: null, logoUrl: null,
  alamat: null, telepon: null, email: null, warnaAksen: "#2563EB",
};
vi.mock("@/lib/branding/get-app-settings", () => ({
  getAppSettings: async () => settings,
}));

import { AppFooter } from "./app-footer";

describe("AppFooter", () => {
  it("shows the year, instansi name, and the exact credit", async () => {
    render(await AppFooter());
    const year = String(new Date().getFullYear());
    expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
    expect(screen.getByText(/PT Contoh/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(CREDIT.replace(/\./g, "\\.")))).toBeInTheDocument();
  });
});
