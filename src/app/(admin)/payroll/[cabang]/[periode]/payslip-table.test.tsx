import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PayslipTable, type PayslipView } from "./payslip-table";

const ROWS: PayslipView[] = [
  {
    id: "s1", nama: "Budi", employeeSlug: "budi", gajiPokok: 10_000_000, hariKerjaEfektif: 20,
    totalPotongan: 500_000, tarifPph21: 1, potonganPph21: 95_000, gajiAkhir: 9_405_000,
    rincian: [
      { tanggal: "2026-08-03", jenis: "alpa", status: "alpa", menit_terlambat: 0, menit_pulang_cepat: 0, potongan: 500_000 },
    ],
  },
];

describe("PayslipTable", () => {
  it("shows an empty prompt when there are no rows", () => {
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={[]} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.getByText(/belum ada slip/i)).toBeInTheDocument();
  });

  it("renders one row per payslip with the final amount", () => {
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    // desktop table + mobile cards both render under jsdom; scope to the
    // desktop <Table> (the only role="table") so getByText asserts exactly one
    const table = within(screen.getByRole("table"));
    const row = table.getByText("Budi").closest("tr") as HTMLElement;
    expect(within(row).getByText(/9\.405\.000/)).toBeInTheDocument();
    // PPh 21 shown separately, with its rate.
    expect(within(row).getByText(/95\.000/)).toBeInTheDocument();
    expect(within(row).getByText("1%")).toBeInTheDocument();
  });

  const CANDIDATES = [
    { id: "e1", nama: "Budi", jabatan: "Staff", gajiPokok: 10_000_000 },
    { id: "e2", nama: "Citra", jabatan: null, gajiPokok: 5_000_000 },
    { id: "e3", nama: "Super Admin", jabatan: null, gajiPokok: 0 },
  ];

  it("generates only for the employees picked in the dialog", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ ok: true, message: "1 slip gaji dibuat." });
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={[]} status="draft" onGenerate={onGenerate} onFinalize={vi.fn()} candidates={CANDIDATES} currentIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /^generate$/i }));
    const dialog = await screen.findByRole("dialog");
    // First run: everyone with a salary is pre-selected; the 0-salary admin is not.
    expect(within(dialog).getByRole("checkbox", { name: /budi/i })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /super admin/i })).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /citra/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /generate 1 slip/i }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(["e1"]));
    expect(await screen.findByText(/1 slip gaji dibuat/i)).toBeInTheDocument();
  });

  it("pre-selects the current slips on regenerate", async () => {
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} candidates={CANDIDATES} currentIds={["e3"]} />);
    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: /super admin/i })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /budi/i })).not.toBeChecked();
  });

  it("hides Generate and Finalize when the period is final", () => {
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="final" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalisasi/i })).not.toBeInTheDocument();
  });

  it("asks for confirmation before finalizing", async () => {
    const onFinalize = vi.fn().mockResolvedValue({ ok: true });
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={onFinalize} />);
    fireEvent.click(screen.getByRole("button", { name: /finalisasi/i }));
    expect(onFinalize).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /finalisasi/i }));
    await waitFor(() => expect(onFinalize).toHaveBeenCalled());
  });

  it("recovers when an action rejects (unbusies and shows a generic error)", async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error("boom"));
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="draft" onGenerate={onGenerate} onFinalize={vi.fn()} candidates={[{ id: "e1", nama: "Budi", jabatan: null, gajiPokok: 1 }]} currentIds={["e1"]} />);
    const generate = screen.getByRole("button", { name: /regenerate/i });
    fireEvent.click(generate);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /generate 1 slip/i }));
    expect(await screen.findByText(/terjadi kesalahan\. coba lagi\./i)).toBeInTheDocument();
    await waitFor(() => expect(generate).not.toBeDisabled());
  });

  it("expands a row to show rincian_harian", () => {
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    const table = within(screen.getByRole("table"));
    fireEvent.click(table.getByRole("button", { name: /rincian budi/i }));
    expect(table.getByText("2026-08-03")).toBeInTheDocument();
  });

  it("reflects toggle state via aria-expanded", () => {
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    const toggle = screen.getAllByRole("button", { name: /rincian budi/i })[0];
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("links each slip by employee name under the period path", () => {
    render(<PayslipTable periodPath="/payroll/kantor-pusat/2026-11" rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/payroll/kantor-pusat/2026-11/budi");
    expect(hrefs).toContain("/payroll/kantor-pusat/2026-11/budi/pdf");
  });
});
