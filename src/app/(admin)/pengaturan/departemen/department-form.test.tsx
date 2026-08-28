import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DepartmentForm } from "./department-form";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("DepartmentForm", () => {
  it("submits nama and branchId", async () => {
    const addDepartment = vi.fn().mockResolvedValue({ ok: true });
    render(<DepartmentForm branches={BRANCHES} addDepartment={addDepartment} />);
    fireEvent.change(screen.getByLabelText(/nama/i), { target: { value: "Operasional" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    await waitFor(() => expect(addDepartment).toHaveBeenCalled());
    const fd = addDepartment.mock.calls[0][0] as FormData;
    expect(fd.get("nama")).toBe("Operasional");
    expect(fd.get("branchId")).toBe("b1");
  });

  it("shows an error from a failed add", async () => {
    const addDepartment = vi.fn().mockResolvedValue({ ok: false, error: "Gagal menambah departemen." });
    render(<DepartmentForm branches={BRANCHES} addDepartment={addDepartment} />);
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    expect(await screen.findByText("Gagal menambah departemen.")).toBeInTheDocument();
  });
});
