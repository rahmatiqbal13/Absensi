import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApprovalTable } from "./approval-table";

const PENDING_REQUESTS = [
  {
    id: "leave-1",
    employeeName: "Budi",
    jenis: "tahunan",
    tanggalMulai: "2026-10-01",
    tanggalSelesai: "2026-10-03",
    alasan: "Liburan",
  },
];

describe("ApprovalTable", () => {
  it("shows an empty state when there are no pending requests", () => {
    render(<ApprovalTable requests={[]} approveLeave={vi.fn()} rejectLeave={vi.fn()} />);
    expect(screen.getByText(/tidak ada pengajuan/i)).toBeInTheDocument();
  });

  it("renders a row per pending request with approve/reject buttons", () => {
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={vi.fn()} rejectLeave={vi.fn()} />,
    );
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /setujui/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tolak/i })).toBeInTheDocument();
  });

  it("calls approveLeave with the request id when Setujui is clicked", async () => {
    const approveLeave = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={approveLeave} rejectLeave={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /setujui/i }));
    await waitFor(() => expect(approveLeave).toHaveBeenCalledWith("leave-1", null));
  });

  it("requires a catatan before calling rejectLeave", async () => {
    const rejectLeave = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={vi.fn()} rejectLeave={rejectLeave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /tolak/i }));
    expect(rejectLeave).not.toHaveBeenCalled();
    expect(screen.getByText(/catatan wajib diisi/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/catatan penolakan/i), {
      target: { value: "Data tidak lengkap" },
    });
    fireEvent.click(screen.getByRole("button", { name: /tolak/i }));
    await waitFor(() =>
      expect(rejectLeave).toHaveBeenCalledWith("leave-1", "Data tidak lengkap"),
    );
  });

  it("shows an error message when an action returns ok: false", async () => {
    const approveLeave = vi.fn().mockResolvedValue({
      ok: false,
      error: "only the assigned approver may act on this request",
    });
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={approveLeave} rejectLeave={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /setujui/i }));
    expect(
      await screen.findByText("only the assigned approver may act on this request"),
    ).toBeInTheDocument();
  });
});
