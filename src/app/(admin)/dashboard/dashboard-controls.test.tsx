import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { DashboardControls } from "./dashboard-controls";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }, { id: "b2", nama: "Cabang B" }];

beforeEach(() => { vi.useFakeTimers(); push.mockClear(); refresh.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe("DashboardControls", () => {
  it("pushes ?branch= when a branch is chosen and clears it for 'Semua'", () => {
    render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    fireEvent.change(screen.getByLabelText(/cabang/i), { target: { value: "b2" } });
    expect(push).toHaveBeenCalledWith("/dashboard?branch=b2");
    fireEvent.change(screen.getByLabelText(/cabang/i), { target: { value: "" } });
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("calls router.refresh() on the Muat ulang button", () => {
    render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    fireEvent.click(screen.getByRole("button", { name: /muat ulang/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("auto-refreshes every 30 seconds and stops on unmount", () => {
    const { unmount } = render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
