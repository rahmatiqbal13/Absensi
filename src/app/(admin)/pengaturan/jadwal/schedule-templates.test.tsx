import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ScheduleTemplates, type Template } from "./schedule-templates";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const kantor: Template = {
  id: "11111111-1111-1111-1111-111111111111",
  nama: "Kantor Sen–Jum",
  schedule: { jamMasuk: "08:00", jamPulang: "16:00", hariKerja: [1, 2, 3, 4, 5], toleransiMenit: 15 },
  usage: { branchIds: ["lab"], departmentIds: [], employeeIds: [] },
};
const kolam: Template = {
  id: "22222222-2222-2222-2222-222222222222",
  nama: "Kolam Renang",
  schedule: { jamMasuk: "07:00", jamPulang: "17:00", hariKerja: [2, 3, 4, 5, 6, 0], toleransiMenit: 10 },
  usage: { branchIds: ["kolam"], departmentIds: [], employeeIds: [] },
};
const props = {
  templates: [kantor, kolam],
  branches: [{ id: "lab", nama: "Lab Doping" }, { id: "usc", nama: "USC Pusat" }, { id: "kolam", nama: "Kolam Renang" }],
  departments: [{ id: "au", nama: "Admin Unit Usaha", branchId: "usc" }],
  staff: [],
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
};

describe("ScheduleTemplates", () => {
  it("lists each jadwal with its hours and where it applies", () => {
    render(<ScheduleTemplates {...props} setTemplateTargets={vi.fn()} />);
    expect(screen.getByText("08:00–16:00 · Sen–Jum · toleransi 15 menit")).toBeInTheDocument();
    expect(screen.getByText("07:00–17:00 · Sel–Min · toleransi 10 menit")).toBeInTheDocument();
  });

  it("keeps its own branches locked and sends added branches and departments", async () => {
    const setTemplateTargets = vi.fn().mockResolvedValue({ ok: true });
    render(<ScheduleTemplates {...props} setTemplateTargets={setTemplateTargets} />);
    fireEvent.click(screen.getAllByRole("button", { name: /berlaku untuk/i })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: /lab doping/i })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /^usc pusat$/i }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /admin unit usaha/i }));
    // Taking Kolam Renang's branch shows where it moves from.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /^kolam renang/i }));
    expect(within(dialog).getByText("pindah dari Kolam Renang")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(setTemplateTargets).toHaveBeenCalledWith(kantor.id, {
        branchIds: ["lab", "usc", "kolam"],
        departmentIds: ["au"],
        employeeIds: [],
      }),
    );
  });
});
