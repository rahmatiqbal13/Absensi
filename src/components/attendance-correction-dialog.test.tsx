import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceCorrectionDialog } from "./attendance-correction-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "sonner";

const COPY = { title: "Ajukan koreksi absensi", description: "d", submitLabel: "Kirim pengajuan", successMessage: "Terkirim." };

describe("AttendanceCorrectionDialog", () => {
  it("prefills the day and submits the form values", async () => {
    const action = vi.fn(async (_fd: FormData) => ({ ok: true as const }));
    render(
      <AttendanceCorrectionDialog
        action={action}
        defaults={{ tanggal: "2026-11-17", jamMasuk: "08:05" }}
        maxDate="2026-11-18"
        {...COPY}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /ajukan koreksi/i }));
    expect(screen.getByLabelText("Tanggal")).toHaveValue("2026-11-17");
    expect(screen.getByLabelText("Jam masuk (WIB)")).toHaveValue("08:05");
    await userEvent.type(screen.getByLabelText("Alasan"), "Lupa absen pulang");
    await userEvent.click(screen.getByRole("button", { name: "Kirim pengajuan" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const fd = action.mock.calls[0][0];
    expect(fd.get("tanggal")).toBe("2026-11-17");
    expect(fd.get("jamMasuk")).toBe("08:05");
    expect(fd.get("alasan")).toBe("Lupa absen pulang");
    expect(toast.success).toHaveBeenCalledWith("Terkirim.");
  });

  it("shows the server error inside the dialog", async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: "Jam pulang harus setelah jam masuk." }));
    render(
      <AttendanceCorrectionDialog
        action={action}
        defaults={{ tanggal: "2026-11-17", jamMasuk: "08:00" }}
        maxDate="2026-11-18"
        {...COPY}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /ajukan koreksi/i }));
    await userEvent.type(screen.getByLabelText("Alasan"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Kirim pengajuan" }));
    expect(await screen.findByText("Jam pulang harus setelah jam masuk.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
