import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { MetricTile } from "./metric-tile";

describe("MetricTile", () => {
  it("renders label, value, and hint", () => {
    render(<MetricTile label="Jarak ke kantor" value="82 m" hint="± 1 menit jalan kaki" />);
    expect(screen.getByText("Jarak ke kantor")).toBeInTheDocument();
    expect(screen.getByText("82 m")).toBeInTheDocument();
    expect(screen.getByText("± 1 menit jalan kaki")).toBeInTheDocument();
  });

  it("applies the status color to the value, not a background", () => {
    render(<MetricTile label="Status" value="Dalam radius" status="good" icon={MapPin} />);
    const value = screen.getByText("Dalam radius");
    expect(value.className).toMatch(/text-emerald/);
    expect(value.className).not.toMatch(/bg-emerald/);
  });
});
