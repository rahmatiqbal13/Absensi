import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodayTimeline, formatClockTime } from "./today-timeline";

describe("formatClockTime", () => {
  it("returns the em dash for a null/blank value", () => {
    expect(formatClockTime(null)).toBe("—");
    expect(formatClockTime("")).toBe("—");
  });

  it("passes through an already-formatted 'HH:mm' string", () => {
    expect(formatClockTime("08:00")).toBe("08:00");
  });

  it("renders an ISO instant in Asia/Jakarta wall-clock, not the process timezone", () => {
    // 2026-09-07T23:30:00Z is 06.30 WIB on 2026-09-08 (UTC+7). Regression test
    // for the missing `timeZone` option — on a UTC-default deployment this would
    // have rendered "23.30" instead of "06.30".
    expect(formatClockTime("2026-09-07T23:30:00Z")).toBe("06.30");
  });
});

describe("TodayTimeline", () => {
  it("shows the Jakarta time for a completed node", () => {
    render(<TodayTimeline jamMasuk="2026-09-07T23:30:00Z" jamPulang={null} />);
    expect(screen.getByText("06.30")).toBeInTheDocument();
  });

  it("renders a check icon on a completed node and an em dash on a pending one", () => {
    const { container } = render(
      <TodayTimeline jamMasuk="2026-09-07T02:00:00Z" jamPulang={null} />,
    );
    // "Masuk" node is done -> the filled circle carries the check icon.
    expect(container.querySelector("svg.lucide-circle-check")).toBeInTheDocument();
    // "Pulang" node is pending -> its value renders as the em dash.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
