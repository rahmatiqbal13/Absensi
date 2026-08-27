import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SetPasswordForm } from "./set-password-form";

describe("SetPasswordForm", () => {
  it("rejects a password shorter than 8 characters", async () => {
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText(/minimal 8 karakter/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation", async () => {
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "password2" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText(/tidak cocok/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with a valid matching password", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("password1"));
  });

  it("shows the error from a failed onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: "Token kedaluwarsa." });
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText("Token kedaluwarsa.")).toBeInTheDocument();
  });
});
