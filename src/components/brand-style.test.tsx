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
  it("emits a style tag with :root keeping the raw accent and .dark lightening it", async () => {
    const ui = await BrandStyle();
    const { container } = render(ui);
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    const css = style!.textContent!;
    expect(css).toContain(":root");
    expect(css).toContain(".dark");
    const root = css.match(/:root\{([^}]*)\}/)![1];
    const dark = css.match(/\.dark\{([^}]*)\}/)![1];
    expect(root).toContain("--primary: #0F766E");
    // #0F766E is dark -> white foreground
    expect(root).toContain("--primary-foreground: #FFFFFF");
    // dark surface needs a lighter accent than the raw teal-700
    expect(dark).not.toContain("--primary: #0F766E");
  });
});
