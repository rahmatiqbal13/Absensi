import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CancelLeaveButton } from "./cancel-leave-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "sonner";

describe("CancelLeaveButton", () => {
  it("asks for confirmation, then runs the action", async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<CancelLeaveButton action={action} approved={false} refundsBalance={false} />);
    await userEvent.click(screen.getByRole("button", { name: /batalkan pengajuan/i }));
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /ya, batalkan/i }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalled();
  });

  it("mentions the balance refund for approved annual leave", async () => {
    render(<CancelLeaveButton action={vi.fn()} approved refundsBalance />);
    await userEvent.click(screen.getByRole("button", { name: /batalkan pengajuan/i }));
    expect(screen.getByText(/saldo cuti tahunan dikembalikan/i)).toBeInTheDocument();
  });

  it("shows the error and keeps the dialog open on failure", async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: "Tidak bisa." }));
    render(<CancelLeaveButton action={action} approved={false} refundsBalance={false} />);
    await userEvent.click(screen.getByRole("button", { name: /batalkan pengajuan/i }));
    await userEvent.click(screen.getByRole("button", { name: /ya, batalkan/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Tidak bisa."));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
