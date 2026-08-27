import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayrollStatusBadge } from "./payroll-status-badge";

describe("PayrollStatusBadge", () => {
  it("renders the Indonesian label and an icon for draft", () => {
    render(<PayrollStatusBadge status="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument();
  });
  it("renders the Indonesian label for final", () => {
    render(<PayrollStatusBadge status="final" />);
    expect(screen.getByText("Final")).toBeInTheDocument();
  });
  it("gives each status a distinct class", () => {
    const { container: draft } = render(<PayrollStatusBadge status="draft" />);
    const { container: final } = render(<PayrollStatusBadge status="final" />);
    expect((draft.firstChild as HTMLElement).className).not.toBe(
      (final.firstChild as HTMLElement).className,
    );
  });
});
