import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CorrectionApprovalList, type PendingCorrection } from "./correction-approval-list";

const REQ: PendingCorrection = {
  id: "c1",
  employeeName: "Sari",
  jabatan: "Staff",
  tanggal: "2026-11-17",
  proposed: { jamMasuk: "2026-11-17T01:00:00.000Z", jamPulang: "2026-11-17T10:00:00.000Z" },
  current: null,
  alasan: "Lupa absen",
};

describe("CorrectionApprovalList", () => {
  it("shows the empty state", () => {
    render(<CorrectionApprovalList requests={[]} approve={vi.fn()} reject={vi.fn()} />);
    expect(screen.getByText(/Tidak ada pengajuan koreksi/)).toBeInTheDocument();
  });

  it("shows before/after and approves", async () => {
    const approve = vi.fn(async () => ({ ok: true as const }));
    render(<CorrectionApprovalList requests={[REQ]} approve={approve} reject={vi.fn()} />);
    expect(screen.getByText("Tidak ada absen")).toBeInTheDocument();
    expect(screen.getByText(/08\.00\.00 – 17\.00\.00|08:00:00 – 17:00:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /setujui/i }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith("c1", null));
  });

  it("requires a note before rejecting", async () => {
    const reject = vi.fn(async () => ({ ok: true as const }));
    render(<CorrectionApprovalList requests={[REQ]} approve={vi.fn()} reject={reject} />);
    await userEvent.click(screen.getByRole("button", { name: /tolak/i }));
    expect(screen.getByText("Catatan wajib diisi untuk menolak.")).toBeInTheDocument();
    expect(reject).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Catatan/), "Tidak sesuai");
    await userEvent.click(screen.getByRole("button", { name: /tolak/i }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith("c1", "Tidak sesuai"));
  });
});
