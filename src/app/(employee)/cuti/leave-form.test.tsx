import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LeaveForm } from "./leave-form";

describe("LeaveForm", () => {
  it("renders jenis, date range, and alasan fields", () => {
    render(<LeaveForm submitLeave={vi.fn()} />);
    expect(screen.getByLabelText(/jenis cuti/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tanggal mulai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tanggal selesai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alasan/i)).toBeInTheDocument();
  });

  it("calls submitLeave with form data on submit", async () => {
    const submitLeave = vi.fn().mockResolvedValue({ ok: true });
    render(<LeaveForm submitLeave={submitLeave} />);

    fireEvent.change(screen.getByLabelText(/jenis cuti/i), { target: { value: "tahunan" } });
    fireEvent.change(screen.getByLabelText(/tanggal mulai/i), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(/tanggal selesai/i), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText(/alasan/i), { target: { value: "Liburan" } });
    fireEvent.click(screen.getByRole("button", { name: /ajukan/i }));

    await waitFor(() => expect(submitLeave).toHaveBeenCalled());
    const formData = submitLeave.mock.calls[0][0] as FormData;
    expect(formData.get("jenis")).toBe("tahunan");
    expect(formData.get("tanggalMulai")).toBe("2026-10-01");
    expect(formData.get("tanggalSelesai")).toBe("2026-10-03");
    expect(formData.get("alasan")).toBe("Liburan");
  });

  it("shows an error message when submitLeave returns ok: false", async () => {
    const submitLeave = vi.fn().mockResolvedValue({
      ok: false,
      error: "Saldo cuti tidak mencukupi.",
    });
    render(<LeaveForm submitLeave={submitLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /ajukan/i }));
    expect(await screen.findByText("Saldo cuti tidak mencukupi.")).toBeInTheDocument();
  });
});
