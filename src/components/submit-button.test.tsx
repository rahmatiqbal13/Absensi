import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SubmitButton } from "./submit-button";

describe("SubmitButton", () => {
  it("shows the pending label and blocks a second submit while the action runs", async () => {
    let finish: () => void = () => {};
    const action = vi.fn(() => new Promise<void>((r) => (finish = r)));
    render(
      <form action={action}>
        <SubmitButton pendingLabel="Sedang masuk…">Masuk</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Masuk" });
    await act(async () => button.click());
    const busy = await screen.findByRole("button", { name: /sedang masuk/i });
    expect(busy).toBeDisabled();
    await act(async () => busy.click());
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(await screen.findByRole("button", { name: "Masuk" })).not.toBeDisabled();
  });
});
