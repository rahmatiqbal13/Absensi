import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetPasswordLinkButton } from "./reset-password-link-button";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { toast } from "sonner";

describe("ResetPasswordLinkButton", () => {
  it("only creates the link after an explicit click inside the dialog", async () => {
    const createLink = vi.fn(async () => ({ ok: true as const, url: "https://x/set-password?t=h&type=recovery" }));
    render(<ResetPasswordLinkButton employeeName="Sari" createLink={createLink} />);
    await userEvent.click(screen.getByRole("button", { name: /reset kata sandi/i }));
    expect(createLink).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /buat link reset/i }));
    await waitFor(() =>
      expect(screen.getByLabelText("Link reset")).toHaveValue("https://x/set-password?t=h&type=recovery"),
    );
  });

  it("shows the error when creation fails", async () => {
    const createLink = vi.fn(async () => ({ ok: false as const, error: "Karyawan nonaktif." }));
    render(<ResetPasswordLinkButton employeeName="Sari" createLink={createLink} />);
    await userEvent.click(screen.getByRole("button", { name: /reset kata sandi/i }));
    await userEvent.click(screen.getByRole("button", { name: /buat link reset/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Karyawan nonaktif."));
  });
});
