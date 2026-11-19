import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequestTabs } from "./request-tabs";

describe("RequestTabs", () => {
  it("includes Koreksi alongside the other request kinds and marks the active one", () => {
    render(<RequestTabs active="koreksi" />);
    const koreksi = screen.getByRole("link", { name: "Koreksi" });
    expect(koreksi).toHaveAttribute("href", "/pengajuan/koreksi");
    expect(koreksi).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Cuti", "Lembur", "Dinas luar", "Koreksi"]);
  });
});
