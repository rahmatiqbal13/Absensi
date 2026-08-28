import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ScheduleForm } from "./schedule-form";

describe("ScheduleForm", () => {
  it("submits jam, hari kerja checkboxes, and toleransi for its branch", async () => {
    const saveSchedule = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ScheduleForm
        branchId="b1"
        branchNama="Kantor Pusat"
        defaults={{ jamMasuk: "09:00", jamPulang: "17:00", hariKerja: [1, 2, 3, 4, 5], toleransiMenit: 15 }}
        saveSchedule={saveSchedule}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(saveSchedule).toHaveBeenCalledWith("b1", expect.any(FormData)));
    const fd = saveSchedule.mock.calls[0][1] as FormData;
    expect(fd.get("jamMasuk")).toBe("09:00");
    expect(fd.getAll("hariKerja")).toEqual(["1", "2", "3", "4", "5"]);
    expect(fd.get("toleransiMenit")).toBe("15");
  });

  it("shows an error from a failed save", async () => {
    const saveSchedule = vi.fn().mockResolvedValue({ ok: false, error: "Jam pulang harus setelah jam masuk." });
    render(
      <ScheduleForm branchId="b1" branchNama="Kantor Pusat" defaults={null} saveSchedule={saveSchedule} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText("Jam pulang harus setelah jam masuk.")).toBeInTheDocument();
  });
});
