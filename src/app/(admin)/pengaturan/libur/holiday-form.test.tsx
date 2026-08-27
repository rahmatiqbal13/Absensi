import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HolidayForm } from "./holiday-form";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("HolidayForm", () => {
  it("submits tanggal, nama, and scope", async () => {
    const addHoliday = vi.fn().mockResolvedValue({ ok: true });
    render(<HolidayForm branches={BRANCHES} addHoliday={addHoliday} />);
    fireEvent.change(screen.getByLabelText(/tanggal/i), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText(/nama/i), { target: { value: "Cuti Bersama" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    await waitFor(() => expect(addHoliday).toHaveBeenCalled());
    const fd = addHoliday.mock.calls[0][0] as FormData;
    expect(fd.get("tanggal")).toBe("2026-12-31");
    expect(fd.get("nama")).toBe("Cuti Bersama");
    expect(fd.get("branchId")).toBe("");
  });

  it("shows an error from a failed add", async () => {
    const addHoliday = vi.fn().mockResolvedValue({ ok: false, error: "Gagal menambah libur." });
    render(<HolidayForm branches={BRANCHES} addHoliday={addHoliday} />);
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    expect(await screen.findByText("Gagal menambah libur.")).toBeInTheDocument();
  });
});
