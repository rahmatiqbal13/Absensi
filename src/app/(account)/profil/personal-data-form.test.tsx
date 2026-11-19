import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { PersonalDataForm } from "./personal-data-form";
import type { PersonalData } from "@/lib/employees/personal-data";

const defaults: PersonalData = {
  tempat_lahir: "Surabaya",
  tanggal_lahir: "1995-01-05",
  jenis_kelamin: "L",
  agama: "Islam",
  pendidikan_terakhir: "S1",
  alamat_ktp: null,
  alamat_domisili: null,
};

describe("PersonalDataForm", () => {
  it("starts read-only: values shown, no inputs, no save button", () => {
    render(<PersonalDataForm defaults={defaults} nomorPegawai="19950105202601001" save={vi.fn()} />);
    expect(screen.getByText("Surabaya")).toBeInTheDocument();
    expect(screen.getByText("5 Januari 1995")).toBeInTheDocument();
    expect(screen.getByText("Laki-laki")).toBeInTheDocument();
    expect(screen.getAllByText("Belum diisi")).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simpan/i })).not.toBeInTheDocument();
  });

  it("Ubah opens the form and Batal closes it without saving", () => {
    const save = vi.fn();
    render(<PersonalDataForm defaults={defaults} nomorPegawai={null} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: /ubah/i }));
    expect(screen.getByLabelText("Tempat lahir")).toHaveValue("Surabaya");
    fireEvent.change(screen.getByLabelText("Tempat lahir"), { target: { value: "Malang" } });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Surabaya")).toBeInTheDocument();
    expect(screen.queryByText("Malang")).not.toBeInTheDocument();
  });

  it("saves, then returns to read-only with the new value", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, nomorPegawai: null, nomorBaru: false });
    render(<PersonalDataForm defaults={defaults} nomorPegawai={null} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: /ubah/i }));
    fireEvent.change(screen.getByLabelText("Tempat lahir"), { target: { value: "Malang" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan data diri/i }));
    await waitFor(() => expect(screen.getByText("Malang")).toBeInTheDocument());
    expect((save.mock.calls[0][0] as FormData).get("tempat_lahir")).toBe("Malang");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("stays in edit mode and shows the error when saving fails", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, error: "Tanggal lahir tidak valid." });
    render(<PersonalDataForm defaults={defaults} nomorPegawai={null} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: /ubah/i }));
    fireEvent.click(screen.getByRole("button", { name: /simpan data diri/i }));
    expect(await screen.findByText("Tanggal lahir tidak valid.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tempat lahir")).toBeInTheDocument();
  });
});
