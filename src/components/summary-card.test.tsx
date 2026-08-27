import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryCard } from "./summary-card";

describe("SummaryCard", () => {
  it("renders the label and value", () => {
    render(<SummaryCard label="Hadir" value={42} />);
    expect(screen.getByText("Hadir")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
