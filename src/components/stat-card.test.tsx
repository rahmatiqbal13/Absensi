import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("renders label, value, and sublabel", () => {
    render(<StatCard label="Hadir" value={42} sublabel="89%" />);
    expect(screen.getByText("Hadir")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("89%")).toBeInTheDocument();
  });

  it("is a plain element (no link) without href", () => {
    const { container } = render(<StatCard label="Alpa" value={3} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("wraps the card in a link when href is set", () => {
    render(<StatCard label="Menunggu persetujuan" value={7} href="/persetujuan-cuti" tone="accent" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/persetujuan-cuti");
    expect(link).toHaveTextContent("Menunggu persetujuan");
    expect(link).toHaveTextContent("7");
  });

  it("tints the value for the destructive tone", () => {
    render(<StatCard label="Alpa" value={3} tone="destructive" />);
    expect(screen.getByText("3").className).toContain("text-destructive");
  });

  it("renders an icon when given", () => {
    const { container } = render(<StatCard label="x" value={1} icon={Users} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
