"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

const HOLD_MS = 1100;

/**
 * Press-and-hold submit for touch and mouse: a deliberate ~1s hold stops a
 * pocket tap from clocking someone in. Keyboard and assistive-tech activation
 * (a click with `detail === 0`) submits straight away so the hold never locks
 * anyone out.
 */
export function HoldButton({
  label,
  disabled,
  busy,
  onConfirm,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  const fill = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setFill(full: boolean, ms: number) {
    const el = fill.current;
    if (!el) return;
    el.style.transition = `clip-path ${ms}ms ${full ? "linear" : "cubic-bezier(0.23,1,0.32,1)"}`;
    el.style.clipPath = full ? "inset(0 0 0 0)" : "inset(0 100% 0 0)";
  }

  function start(e: React.PointerEvent) {
    if (disabled || e.button !== 0) return;
    setFill(true, HOLD_MS);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setFill(false, 0);
      onConfirm();
    }, HOLD_MS);
  }

  function cancel() {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setFill(false, 220);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy || undefined}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // detail === 0: keyboard (Enter/Space) or AT activation, not a pointer.
        if (e.detail === 0 && !disabled) onConfirm();
      }}
      className={cn(
        "relative h-[68px] w-full touch-none overflow-hidden rounded-[18px] bg-primary text-[1.05rem] font-semibold text-primary-foreground select-none outline-none focus-visible:ring-3 focus-visible:ring-brand/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted-foreground/60",
        "transition-transform duration-150",
      )}
    >
      <span className="relative z-10">{busy ? "Menyimpan…" : `Tahan untuk ${label}`}</span>
      <span
        ref={fill}
        aria-hidden="true"
        className="absolute inset-0 bg-brand"
        style={{ clipPath: "inset(0 100% 0 0)" }}
      />
    </button>
  );
}
