// src/no-legacy-classes.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(process.cwd(), "src", "app");

const ROOTS = [
  { label: "src/app", dir: join(process.cwd(), "src", "app"), exclude: undefined as RegExp | undefined },
  {
    label: "src/components",
    dir: join(process.cwd(), "src", "components"),
    exclude: /^ui\//,
  },
];

// Deliberate exception: brand-preview.tsx renders literal light/dark preview
// swatches (bg-white + `dark bg-neutral-950`) so a super_admin sees their accent
// on both backgrounds regardless of the current theme.
const ALLOWLIST = new Set(["(admin)/pengaturan/instansi/brand-preview.tsx"]);

const GRAYS = "neutral|gray|slate|zinc|stone";
const BANNED: [RegExp, string][] = [
  [new RegExp(`\\btext-(?:${GRAYS})-[1-9]00\\b`), "text-<gray>-N00"],
  [new RegExp(`\\bbg-(?:${GRAYS})-\\d`), "bg-<gray>-*"],
  [new RegExp(`\\bborder-(?:${GRAYS})-\\d`), "border-<gray>-*"],
  [new RegExp(`\\bdivide-(?:${GRAYS})-\\d`), "divide-<gray>-*"],
  [/\bbg-white\b/, "bg-white"],
  [/\btext-white\b/, "text-white"],
  [/\bbg-black\b/, "bg-black"],
  [/\bbg-blue-\d/, "bg-blue-*"],
  [/\btext-blue-\d/, "text-blue-*"],
  [/\bhover:(?:bg|border)-blue-\d/, "hover:*-blue-*"],
  [/\btext-red-[56]00\b/, "text-red-[56]00"],
  [/\btext-green-[56]00\b/, "text-green-[56]00"],
  [/\bbg-(?:red|green|amber|blue)-50\b/, "bg-<color>-50"],
  [/\bborder-(?:red|green|amber|blue)-200\b/, "border-<color>-200"],
];

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(abs, r));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(r);
  }
  return out;
}

describe("no legacy Tailwind classes", () => {
  it("has no banned class in any non-test file", () => {
    const violations: string[] = [];
    for (const { label, dir, exclude } of ROOTS) {
      for (const rel of walk(dir)) {
        if (exclude && exclude.test(rel)) continue;
        if (label === "src/app" && ALLOWLIST.has(rel)) continue;
        const lines = readFileSync(join(dir, rel), "utf8").split("\n");
        lines.forEach((line, i) => {
          for (const [re, name] of BANNED) {
            if (re.test(line)) violations.push(`${label}/${rel}:${i + 1} — matched "${name}"`);
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the allowlist minimal — every allowlisted file still needs it", () => {
    for (const rel of ALLOWLIST) {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      expect(
        BANNED.some(([re]) => re.test(src)),
        `${rel} no longer needs allowlisting — remove it from ALLOWLIST`,
      ).toBe(true);
    }
  });
});
