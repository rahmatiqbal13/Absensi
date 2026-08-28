import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { LaporanFilters } from "./laporan-filters";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }, { id: "b2", nama: "Cabang B" }];
const DEPTS = [{ id: "d1", nama: "Operasional", branchId: "b1" }];

describe("LaporanFilters", () => {
  it("renders cabang / departemen / dari / sampai controls", () => {
    render(<LaporanFilters branches={BRANCHES} departments={DEPTS} defaults={{ cabang: "b1", dept: "", dari: "2026-08-01", sampai: "2026-08-31" }} />);
    expect(screen.getByLabelText(/cabang/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/departemen/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dari/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sampai/i)).toBeInTheDocument();
  });

  it("pushes the full query string when cabang changes", () => {
    push.mockClear();
    render(<LaporanFilters branches={BRANCHES} departments={DEPTS} defaults={{ cabang: "b1", dept: "", dari: "2026-08-01", sampai: "2026-08-31" }} />);
    fireEvent.change(screen.getByLabelText(/cabang/i), { target: { value: "b2" } });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("cabang=b2"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("dari=2026-08-01"));
  });
});
