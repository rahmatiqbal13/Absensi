import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaveStatusBadge } from "./leave-status-badge";

describe("LeaveStatusBadge", () => {
  it("renders the Indonesian label and an icon for pending", () => {
    const { container } = render(<LeaveStatusBadge status="pending" />);
    expect(screen.getByText("Menunggu")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the Indonesian label for approved", () => {
    render(<LeaveStatusBadge status="approved" />);
    expect(screen.getByText("Disetujui")).toBeInTheDocument();
  });

  it("renders the Indonesian label for rejected", () => {
    render(<LeaveStatusBadge status="rejected" />);
    expect(screen.getByText("Ditolak")).toBeInTheDocument();
  });

  it("gives each status a distinct background color class", () => {
    const { container: pending } = render(<LeaveStatusBadge status="pending" />);
    const { container: approved } = render(<LeaveStatusBadge status="approved" />);
    expect(pending.firstChild).not.toHaveClass(
      (approved.firstChild as HTMLElement).className,
    );
  });
});
