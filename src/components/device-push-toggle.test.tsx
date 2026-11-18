import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevicePushToggle } from "./device-push-toggle";

describe("DevicePushToggle", () => {
  it("explains when the browser can't receive push (jsdom has no PushManager)", async () => {
    render(<DevicePushToggle save={vi.fn()} remove={vi.fn()} />);
    expect(await screen.findByText(/belum mendukung notifikasi/i)).toBeInTheDocument();
  });
});
