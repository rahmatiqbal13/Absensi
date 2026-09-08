import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { BranchManager, type BranchRow } from "./branch-manager";

const ROWS: BranchRow[] = [
  {
    id: "b1",
    nama: "Kantor Pusat",
    alamat: "Jl. Merdeka 1",
    lat: -6.2,
    long: 106.8,
    radius: 100,
    employeeCount: 3,
    departmentCount: 2,
  },
  {
    id: "b2",
    nama: "Cabang Bandung",
    alamat: null,
    lat: 0,
    long: 0,
    radius: 100,
    employeeCount: 0,
    departmentCount: 0,
  },
];

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type Result = { ok: true } | { ok: false; error: string };

function setup(overrides?: {
  branches?: BranchRow[];
  createBranch?: (fd: FormData) => Promise<CreateResult>;
  updateBranch?: (id: string, fd: FormData) => Promise<Result>;
  deleteBranch?: (id: string) => Promise<Result>;
}) {
  const createBranch = vi.fn(overrides?.createBranch ?? (async () => ({ ok: true, id: "b9" }) as CreateResult));
  const updateBranch = vi.fn(overrides?.updateBranch ?? (async () => ({ ok: true }) as Result));
  const deleteBranch = vi.fn(overrides?.deleteBranch ?? (async () => ({ ok: true }) as Result));
  render(
    <BranchManager
      branches={overrides?.branches ?? ROWS}
      createBranch={createBranch}
      updateBranch={updateBranch}
      deleteBranch={deleteBranch}
    />,
  );
  return { createBranch, updateBranch, deleteBranch };
}

describe("BranchManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders each branch's nama, alamat ('—' when null) and a geofence chip", () => {
    setup();
    expect(screen.getAllByText("Kantor Pusat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cabang Bandung").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jl. Merdeka 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Aktif").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Belum diatur").length).toBeGreaterThan(0);
  });

  it("submits nama and alamat to createBranch", async () => {
    const { createBranch } = setup();
    fireEvent.change(screen.getByLabelText("Nama Cabang"), { target: { value: "Cabang Surabaya" } });
    fireEvent.change(screen.getByLabelText("Alamat"), { target: { value: "Jl. Tunjungan 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah Cabang" }));
    await waitFor(() => expect(createBranch).toHaveBeenCalled());
    const fd = createBranch.mock.calls[0][0] as FormData;
    expect(fd.get("nama")).toBe("Cabang Surabaya");
    expect(fd.get("alamat")).toBe("Jl. Tunjungan 5");
  });

  it("shows the error from a failed create in an Alert", async () => {
    setup({ createBranch: async () => ({ ok: false, error: "Nama cabang wajib diisi." }) });
    fireEvent.click(screen.getByRole("button", { name: "Tambah Cabang" }));
    expect(await screen.findByText("Nama cabang wajib diisi.")).toBeInTheDocument();
  });

  it("opens a prefilled edit dialog and submits updateBranch(id, fd)", async () => {
    const { updateBranch } = setup({ branches: [ROWS[0]] });
    fireEvent.click(screen.getAllByRole("button", { name: "Ubah" })[0]);
    expect(await screen.findByText("Ubah Cabang")).toBeInTheDocument();
    const nama = screen.getByLabelText("Nama Cabang", { selector: "#edit-nama" }) as HTMLInputElement;
    expect(nama.value).toBe("Kantor Pusat");
    fireEvent.change(nama, { target: { value: "Kantor Pusat Baru" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateBranch).toHaveBeenCalled());
    expect(updateBranch.mock.calls[0][0]).toBe("b1");
    const fd = updateBranch.mock.calls[0][1] as FormData;
    expect(fd.get("nama")).toBe("Kantor Pusat Baru");
  });

  it("surfaces a rejected delete via toast.error", async () => {
    setup({
      branches: [ROWS[0]],
      deleteBranch: async () => ({ ok: false, error: "Cabang masih dipakai: 3 karyawan." }),
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Hapus" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus", hidden: false }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Cabang masih dipakai: 3 karyawan."),
    );
  });

  it("renders the EmptyState when there are no branches", () => {
    setup({ branches: [] });
    expect(screen.getByText("Belum ada cabang.")).toBeInTheDocument();
  });
});
