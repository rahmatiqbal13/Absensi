import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the title as an h1", () => {
    render(<PageHeader title="Laporan Kehadiran" />);
    expect(screen.getByRole("heading", { level: 1, name: "Laporan Kehadiran" })).toBeInTheDocument();
  });
  it("renders the description and actions", () => {
    render(<PageHeader title="X" description="Ringkasan" actions={<button>Unduh</button>} />);
    expect(screen.getByText("Ringkasan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unduh" })).toBeInTheDocument();
  });
});
