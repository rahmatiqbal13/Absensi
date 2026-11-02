import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HoldButton } from "./hold-button";

afterEach(() => vi.useRealTimers());

function setup(disabled = false) {
  const onConfirm = vi.fn();
  render(<HoldButton label="Absen Masuk" disabled={disabled} busy={false} onConfirm={onConfirm} />);
  return { onConfirm, button: screen.getByRole("button", { name: /tahan untuk absen masuk/i }) };
}

describe("HoldButton", () => {
  it("confirms only after the pointer is held for the full duration", () => {
    vi.useFakeTimers();
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button, { button: 0 });
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels when the pointer is released early", () => {
    vi.useFakeTimers();
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button, { button: 0 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(button);
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms immediately on keyboard / assistive activation (click with detail 0)", () => {
    const { onConfirm, button } = setup();
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("ignores a plain mouse click (detail 1) — the hold is required", () => {
    const { onConfirm, button } = setup();
    fireEvent.click(button, { detail: 1 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does nothing while disabled", () => {
    const { onConfirm, button } = setup(true);
    expect(button).toBeDisabled();
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
