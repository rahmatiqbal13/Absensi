import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/branding/get-app-settings", () => ({
  getAppSettings: async () => ({
    namaInstansi: "X", namaSingkat: "X", tagline: null, logoUrl: null,
    alamat: null, telepon: null, email: null, warnaAksen: "#0F766E",
  }),
}));

import { BrandStyle } from "./brand-style";

describe("BrandStyle", () => {
  it("emits --brand on :root (raw accent) and a lightened --brand for .dark", async () => {
    const ui = await BrandStyle();
    const { container } = render(ui);
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    const css = style!.textContent!;
    expect(css).toContain(":root");
    expect(css).toContain(".dark");
    const root = css.match(/:root\{([^}]*)\}/)![1];
    const dark = css.match(/\.dark\{([^}]*)\}/)![1];
    expect(root).toContain("--brand: #0F766E");
    // #0F766E is dark -> white foreground
    expect(root).toContain("--brand-foreground: #FFFFFF");
    expect(root).toContain("--brand-text:");
    // primary stays ink — the accent no longer recolours every button
    expect(root).not.toContain("--primary");
    // dark surface needs a lighter accent than the raw teal-700
    expect(dark).not.toContain("--brand: #0F766E");
  });
});
