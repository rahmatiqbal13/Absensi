import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalList, type PendingLeaveRequest } from "./approval-list";

const req: PendingLeaveRequest = {
  id: "r1", employeeName: "Andi", jenis: "tahunan",
  tanggalMulai: "2026-09-01", tanggalSelesai: "2026-09-03", alasan: "Liburan",
};

describe("ApprovalList", () => {
  it("shows the empty state when there are no requests", () => {
    render(<ApprovalList requests={[]} approveLeave={vi.fn()} rejectLeave={vi.fn()} />);
    expect(screen.getByText(/Tidak ada pengajuan cuti/i)).toBeInTheDocument();
  });

  it("approves with a trimmed note (or null)", async () => {
    const user = userEvent.setup();
    const approveLeave = vi.fn().mockResolvedValue({ ok: true });
    render(<ApprovalList requests={[req]} approveLeave={approveLeave} rejectLeave={vi.fn()} />);
    // desktop + mobile both render; act on the first Setujui button
    await user.click(screen.getAllByRole("button", { name: /setujui/i })[0]);
    expect(approveLeave).toHaveBeenCalledWith("r1", null);
  });

  it("blocks reject without a note and shows the error", async () => {
    const user = userEvent.setup();
    const rejectLeave = vi.fn();
    render(<ApprovalList requests={[req]} approveLeave={vi.fn()} rejectLeave={rejectLeave} />);
    await user.click(screen.getAllByRole("button", { name: /tolak/i })[0]);
    expect(rejectLeave).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Catatan wajib diisi untuk menolak/i).length).toBeGreaterThan(0);
  });

  it("rejects with a note", async () => {
    const user = userEvent.setup();
    const rejectLeave = vi.fn().mockResolvedValue({ ok: true });
    render(<ApprovalList requests={[req]} approveLeave={vi.fn()} rejectLeave={rejectLeave} />);
    await user.type(screen.getAllByPlaceholderText(/wajib diisi untuk menolak/i)[0], "  Tidak disetujui  ");
    await user.click(screen.getAllByRole("button", { name: /tolak/i })[0]);
    expect(rejectLeave).toHaveBeenCalledWith("r1", "Tidak disetujui");
  });

  it("surfaces a failing action's error", async () => {
    const user = userEvent.setup();
    const approveLeave = vi.fn().mockResolvedValue({ ok: false, error: "Server sibuk." });
    render(<ApprovalList requests={[req]} approveLeave={approveLeave} rejectLeave={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /setujui/i })[0]);
    expect(screen.getAllByText("Server sibuk.").length).toBeGreaterThan(0);
  });
});
