"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

import { DEFAULT_MOTIF, MOTIF_STORAGE_KEY, type Motif } from "@/lib/motif";

const listeners = new Set<() => void>();

function read(): Motif {
  return document.documentElement.dataset.motif === "polos" ? "polos" : "batik";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setMotif(m: Motif) {
  document.documentElement.dataset.motif = m;
  try {
    localStorage.setItem(MOTIF_STORAGE_KEY, m);
  } catch {
    // Private mode / blocked storage: the choice still applies for this page.
  }
  listeners.forEach((l) => l());
}

const OPTIONS: { v: Motif; label: string }[] = [
  { v: "polos", label: "Polos" },
  { v: "batik", label: "Batik" },
];

/** Polos / Batik switch for the navy sidebar. */
export function MotifToggle({ className }: { className?: string }) {
  const motif = useSyncExternalStore(subscribe, read, () => DEFAULT_MOTIF);
  return (
    <div role="group" aria-label="Motif tampilan" className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold text-sidebar-faint">Motif tampilan</span>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-sidebar-accent/70 p-1">
        {OPTIONS.map((o) => {
          const on = motif === o.v;
          return (
            <button
              key={o.v}
              type="button"
              aria-pressed={on}
              onClick={() => setMotif(o.v)}
              className={cn(
                "min-h-11 rounded-[8px] text-[0.85rem] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                on ? "bg-primary text-primary-foreground" : "text-sidebar-muted hover:text-sidebar-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
