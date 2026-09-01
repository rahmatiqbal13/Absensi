import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";
import { ConfirmDeleteButton } from "./confirm-delete-button";

const base = {
  title: "Hapus departemen?",
  description: "Departemen \"Operasional\" akan dihapus.",
};

describe("ConfirmDeleteButton", () => {
  it("renders a trigger with the default label and opens the dialog on click", async () => {
    const user = userEvent.setup();
    render(<ConfirmDeleteButton {...base} action={vi.fn().mockResolvedValue({ ok: true })} />);
    const trigger = screen.getByRole("button", { name: /hapus/i });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    expect(await screen.findByText("Hapus departemen?")).toBeVisible();
    expect(screen.getByText(/akan dihapus/i)).toBeVisible();
  });

  it("uses a custom label", () => {
    render(<ConfirmDeleteButton {...base} label="Buang" action={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Buang" })).toBeInTheDocument();
  });

  it("calls action when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<ConfirmDeleteButton {...base} action={action} />);
    await user.click(screen.getByRole("button", { name: /hapus/i }));
    await user.click(await screen.findByRole("button", { name: "Hapus", hidden: false }));
    // there are two "Hapus" — the trigger and the AlertDialogAction; pick the one inside the dialog
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("toasts and keeps the dialog open when action fails", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: false, error: "Masih dipakai karyawan." });
    render(<ConfirmDeleteButton {...base} action={action} confirmLabel="Ya, hapus" />);
    await user.click(screen.getByRole("button", { name: /hapus/i }));
    await user.click(await screen.findByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Masih dipakai karyawan."));
    expect(screen.getByText("Hapus departemen?")).toBeVisible(); // still open
  });

  it("closes the dialog on success", async () => {
    const user = userEvent.setup();
    render(<ConfirmDeleteButton {...base} action={vi.fn().mockResolvedValue({ ok: true })} confirmLabel="Ya, hapus" />);
    await user.click(screen.getByRole("button", { name: /hapus/i }));
    await user.click(await screen.findByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(screen.queryByText("Hapus departemen?")).not.toBeInTheDocument());
  });
});
