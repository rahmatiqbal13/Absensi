import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetPasswordForm } from "./set-password-form";

describe("SetPasswordForm", () => {
  it("rejects a password under 8 chars", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Kata Sandi"), "short");
    await user.type(screen.getByLabelText("Konfirmasi Kata Sandi"), "short");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(screen.getByText(/minimal 8/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a mismatch", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Kata Sandi"), "password123");
    await user.type(screen.getByLabelText("Konfirmasi Kata Sandi"), "password124");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(screen.getByText(/tidak cocok/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit and shows the success state on a valid submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<SetPasswordForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Kata Sandi"), "password123");
    await user.type(screen.getByLabelText("Konfirmasi Kata Sandi"), "password123");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(onSubmit).toHaveBeenCalledWith("password123");
    expect(await screen.findByText(/berhasil/i)).toBeInTheDocument();
  });
});
