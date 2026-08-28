import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttendanceStatusBadge } from "./attendance-status-badge";

describe("AttendanceStatusBadge", () => {
  it("renders the Indonesian label and an icon for tepat_waktu", () => {
    const { container } = render(<AttendanceStatusBadge status="tepat_waktu" />);
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the Indonesian label for terlambat", () => {
    render(<AttendanceStatusBadge status="terlambat" />);
    expect(screen.getByText("Terlambat")).toBeInTheDocument();
  });

  it("renders the Indonesian label for pulang_cepat", () => {
    render(<AttendanceStatusBadge status="pulang_cepat" />);
    expect(screen.getByText("Pulang Cepat")).toBeInTheDocument();
  });

  it("renders the Indonesian label for alpa", () => {
    render(<AttendanceStatusBadge status="alpa" />);
    expect(screen.getByText("Alpa")).toBeInTheDocument();
  });

  it("renders the Indonesian label for di_luar_lokasi", () => {
    render(<AttendanceStatusBadge status="di_luar_lokasi" />);
    expect(screen.getByText("Di Luar Lokasi")).toBeInTheDocument();
  });

  it("gives each status a distinct background color class, never relying on color alone", () => {
    const { container: onTime } = render(<AttendanceStatusBadge status="tepat_waktu" />);
    const { container: late } = render(<AttendanceStatusBadge status="terlambat" />);
    expect(onTime.firstChild).not.toHaveClass((late.firstChild as HTMLElement).className);
    // Text label must always be present alongside color (accessibility requirement).
    expect(onTime.querySelector("span")?.textContent).toBeTruthy();
  });
});
