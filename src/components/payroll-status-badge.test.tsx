import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayrollStatusBadge, payrollDisplayStatus } from "./payroll-status-badge";

describe("PayrollStatusBadge", () => {
  it("renders the Indonesian label and an icon for draft", () => {
    const { container } = render(<PayrollStatusBadge status="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
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
  it("labels a paid period as Dibayar", () => {
    render(<PayrollStatusBadge status="dibayar" />);
    expect(screen.getByText("Dibayar")).toBeInTheDocument();
  });
  it("derives dibayar only for a final period with a payment date", () => {
    expect(payrollDisplayStatus("final", "2026-11-25")).toBe("dibayar");
    expect(payrollDisplayStatus("final", null)).toBe("final");
    expect(payrollDisplayStatus("draft", "2026-11-25")).toBe("draft");
  });
});
