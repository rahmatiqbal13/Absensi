import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MotifToggle } from "./motif-toggle";
import { MOTIF_INIT_SCRIPT, MOTIF_STORAGE_KEY } from "@/lib/motif";

// Node's own (flag-gated) localStorage global shadows jsdom's; use a plain
// in-memory Storage so the test does not depend on the Node version.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  delete document.documentElement.dataset.motif;
});

describe("MOTIF_INIT_SCRIPT", () => {
  it("defaults to batik and honours a stored choice", () => {
    new Function(MOTIF_INIT_SCRIPT)();
    expect(document.documentElement.dataset.motif).toBe("batik");
    localStorage.setItem(MOTIF_STORAGE_KEY, "polos");
    new Function(MOTIF_INIT_SCRIPT)();
    expect(document.documentElement.dataset.motif).toBe("polos");
  });
});

describe("MotifToggle", () => {
  it("switches the motif and remembers it", () => {
    document.documentElement.dataset.motif = "batik";
    render(<MotifToggle />);
    const polos = screen.getByRole("button", { name: "Polos" });
    expect(screen.getByRole("button", { name: "Batik" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(polos);
    expect(document.documentElement.dataset.motif).toBe("polos");
    expect(localStorage.getItem(MOTIF_STORAGE_KEY)).toBe("polos");
    expect(polos.getAttribute("aria-pressed")).toBe("true");
  });
});
