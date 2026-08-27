import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PayslipTable, type PayslipView } from "./payslip-table";

const ROWS: PayslipView[] = [
  {
    id: "s1", nama: "Budi", gajiPokok: 10_000_000, hariKerjaEfektif: 20,
    totalPotongan: 500_000, gajiAkhir: 9_500_000,
    rincian: [
      { tanggal: "2026-08-03", jenis: "alpa", status: "alpa", menit_terlambat: 0, menit_pulang_cepat: 0, potongan: 500_000 },
    ],
  },
];

describe("PayslipTable", () => {
  it("shows an empty prompt when there are no rows", () => {
    render(<PayslipTable rows={[]} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.getByText(/belum ada slip/i)).toBeInTheDocument();
  });

  it("renders one row per payslip with the final amount", () => {
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText(/9\.500\.000/)).toBeInTheDocument();
  });

  it("calls onGenerate when Generate is clicked", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ ok: true, message: "1 slip gaji dibuat." });
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={onGenerate} onFinalize={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(await screen.findByText(/1 slip gaji dibuat/i)).toBeInTheDocument();
  });

  it("hides Generate and Finalize when the period is final", () => {
    render(<PayslipTable rows={ROWS} status="final" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalisasi/i })).not.toBeInTheDocument();
  });

  it("asks for confirmation before finalizing", async () => {
    const onFinalize = vi.fn().mockResolvedValue({ ok: true });
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={onFinalize} />);
    fireEvent.click(screen.getByRole("button", { name: /finalisasi/i }));
    expect(onFinalize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /ya, finalisasi/i }));
    await waitFor(() => expect(onFinalize).toHaveBeenCalled());
  });

  it("recovers when an action rejects (unbusies and shows a generic error)", async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error("boom"));
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={onGenerate} onFinalize={vi.fn()} />);
    const generate = screen.getByRole("button", { name: /generate/i });
    fireEvent.click(generate);
    expect(await screen.findByText(/terjadi kesalahan\. coba lagi\./i)).toBeInTheDocument();
    await waitFor(() => expect(generate).not.toBeDisabled());
  });

  it("expands a row to show rincian_harian", () => {
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /rincian budi/i }));
    expect(screen.getByText("2026-08-03")).toBeInTheDocument();
  });

  it("reflects toggle state via aria-expanded", () => {
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: /rincian budi/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
