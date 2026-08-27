import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreatePeriodForm } from "./create-period-form";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("CreatePeriodForm", () => {
  it("renders branch, month and year fields", () => {
    render(<CreatePeriodForm branches={BRANCHES} createPeriod={vi.fn()} />);
    expect(screen.getByLabelText(/cabang/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bulan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tahun/i)).toBeInTheDocument();
  });

  it("submits branch, month and year", async () => {
    const createPeriod = vi.fn().mockResolvedValue({ ok: true });
    render(<CreatePeriodForm branches={BRANCHES} createPeriod={createPeriod} />);
    fireEvent.change(screen.getByLabelText(/bulan/i), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText(/tahun/i), { target: { value: "2026" } });
    fireEvent.click(screen.getByRole("button", { name: /buat periode/i }));
    await waitFor(() => expect(createPeriod).toHaveBeenCalled());
    const fd = createPeriod.mock.calls[0][0] as FormData;
    expect(fd.get("branchId")).toBe("b1");
    expect(fd.get("bulan")).toBe("8");
    expect(fd.get("tahun")).toBe("2026");
  });

  it("shows the error from a failed create", async () => {
    const createPeriod = vi.fn().mockResolvedValue({ ok: false, error: "Periode payroll untuk cabang dan bulan ini sudah ada." });
    render(<CreatePeriodForm branches={BRANCHES} createPeriod={createPeriod} />);
    fireEvent.click(screen.getByRole("button", { name: /buat periode/i }));
    expect(await screen.findByText(/sudah ada/i)).toBeInTheDocument();
  });
});
