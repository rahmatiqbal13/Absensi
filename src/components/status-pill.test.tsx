import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./status-pill";

describe("StatusPill", () => {
  it("renders Aktif with the success variant", () => {
    render(<StatusPill status="aktif" />);
    const el = screen.getByText("Aktif");
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("data-variant")).toBe("success");
  });
  it("renders Nonaktif with the neutral variant", () => {
    render(<StatusPill status="nonaktif" />);
    const el = screen.getByText("Nonaktif");
    expect(el.getAttribute("data-variant")).toBe("neutral");
  });
});
