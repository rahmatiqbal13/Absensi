"use client";

import { useSyncExternalStore } from "react";

// One shared ticker per interval: every clock on the page reads the same Date,
// and the snapshot only changes when the interval fires (stable between ticks).
type Ticker = {
  now: Date;
  listeners: Set<() => void>;
  id?: ReturnType<typeof setInterval>;
  // Stable per interval: useSyncExternalStore re-subscribes whenever this
  // function identity changes.
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => Date;
};
const tickers = new Map<number, Ticker>();

function ticker(intervalMs: number): Ticker {
  let t = tickers.get(intervalMs);
  if (!t) {
    const created: Ticker = {
      now: new Date(),
      listeners: new Set(),
      subscribe: (onChange) => subscribe(created, intervalMs, onChange),
      getSnapshot: () => created.now,
    };
    tickers.set(intervalMs, created);
    t = created;
  }
  return t;
}

function subscribe(t: Ticker, intervalMs: number, onChange: () => void) {
  t.listeners.add(onChange);
  if (t.id === undefined) {
    t.id = setInterval(() => {
      t.now = new Date();
      t.listeners.forEach((l) => l());
    }, intervalMs);
  }
  return () => {
    t.listeners.delete(onChange);
    if (t.listeners.size === 0 && t.id !== undefined) {
      clearInterval(t.id);
      t.id = undefined;
    }
  };
}

const getServerSnapshot = () => null;

// A ticking "now" for live clocks. The server snapshot is null so server HTML
// and hydration agree (no mismatch); callers render a placeholder for null.
export function useNow(intervalMs = 1000): Date | null {
  const t = ticker(intervalMs);
  return useSyncExternalStore(t.subscribe, t.getSnapshot, getServerSnapshot);
}

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// Wall-clock parts in WIB, independent of the device timezone.
export function jakartaClock(d: Date): { hm: string; s: string; minutesOfDay: number } {
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  const h = Number(p.hour);
  const m = Number(p.minute);
  return { hm: `${p.hour}:${p.minute}`, s: p.second, minutesOfDay: h * 60 + m };
}

const LONG = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const SHORT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export const formatJakartaLong = (d: Date) => LONG.format(d);
export const formatJakartaShort = (d: Date) => SHORT.format(d);
