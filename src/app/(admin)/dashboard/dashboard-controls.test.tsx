import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DashboardControls } from "./dashboard-controls";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }, { id: "b2", nama: "Cabang B" }];

beforeEach(() => { vi.useFakeTimers(); refresh.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe("DashboardControls", () => {
  it("links each branch to ?branch= and marks the selected one", () => {
    render(<DashboardControls branches={BRANCHES} selectedBranch="b2" />);
    expect(screen.getByRole("link", { name: "Semua cabang" }).getAttribute("href")).toBe("/dashboard");
    const b2 = screen.getByRole("link", { name: "Cabang B" });
    expect(b2.getAttribute("href")).toBe("/dashboard?branch=b2");
    expect(b2.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Kantor Pusat" }).getAttribute("aria-current")).toBeNull();
  });

  it("calls router.refresh() on the Muat ulang button", () => {
    render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    fireEvent.click(screen.getByRole("button", { name: /muat ulang/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows when the data was rendered, in WIB", () => {
    render(<DashboardControls branches={BRANCHES} selectedBranch="" renderedAt="2026-11-25T02:05:09Z" />);
    expect(screen.getByText("Diperbarui 09.05.09")).toBeTruthy();
  });

  it("does not poll on its own (the page's AutoRefresh does, only while visible)", () => {
    const { unmount } = render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    act(() => { vi.advanceTimersByTime(5 * 60_000); });
    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });
});
