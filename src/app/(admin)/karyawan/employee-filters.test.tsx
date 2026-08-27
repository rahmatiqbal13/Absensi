import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams() }));

import { EmployeeFilters } from "./employee-filters";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("EmployeeFilters", () => {
  it("pushes a query string when the status filter changes", () => {
    push.mockClear();
    render(<EmployeeFilters branches={BRANCHES} defaults={{ status: "aktif", q: "" }} />);
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "nonaktif" } });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("status=nonaktif"));
  });

  it("pushes the search text on submit", () => {
    push.mockClear();
    render(<EmployeeFilters branches={BRANCHES} defaults={{ status: "aktif", q: "" }} />);
    fireEvent.change(screen.getByLabelText(/cari nama/i), { target: { value: "budi" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("q=budi"));
  });
});
