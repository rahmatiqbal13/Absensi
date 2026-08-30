import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";

config({ path: ".env.local" });

// Radix UI (Dropdown/Sheet) relies on Pointer Capture + scrollIntoView, which
// jsdom does not implement. Shim them so overlays open under the test runner.
// Radix (Sheet/DropdownMenu/Select) needs these; jsdom 26 ships non-functional
// stubs, so we override unconditionally. Tests that spy on scrollIntoView must
// re-mock it locally.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
}
