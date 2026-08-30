import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";

config({ path: ".env.local" });

// Radix UI (Dropdown/Sheet) relies on Pointer Capture + scrollIntoView, which
// jsdom does not implement. Shim them so overlays open under the test runner.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
}
