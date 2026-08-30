import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.stubGlobal("URL", {
  ...URL,
  createObjectURL: () => "blob:x",
  revokeObjectURL: () => {},
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { resizeToSquareJpeg } = vi.hoisted(() => ({ resizeToSquareJpeg: vi.fn() }));
vi.mock("@/lib/profile/image", () => ({ resizeToSquareJpeg }));

import { toast } from "sonner";
import { ProfilForm } from "./profil-form";

const base = {
  defaultPhone: "081234567",
  nama: "Budi Santoso",
  photoUrl: null as string | null,
  updatePhone: vi.fn().mockResolvedValue({ ok: true }),
  uploadPhoto: vi.fn().mockResolvedValue({ ok: true }),
  removePhoto: vi.fn().mockResolvedValue({ ok: true }),
};

describe("ProfilForm", () => {
  it("renders the phone field prefilled and the photo controls with initials fallback", () => {
    render(<ProfilForm {...base} />);
    expect(screen.getByLabelText(/nomor telepon/i)).toHaveValue("081234567");
    expect(screen.getByText("BS")).toBeInTheDocument(); // initials fallback
    expect(screen.getByRole("button", { name: /ganti foto/i })).toBeInTheDocument();
  });

  it("submits the phone to updatePhone", async () => {
    const user = userEvent.setup();
    const updatePhone = vi.fn().mockResolvedValue({ ok: true });
    render(<ProfilForm {...base} updatePhone={updatePhone} />);
    await user.clear(screen.getByLabelText(/nomor telepon/i));
    await user.type(screen.getByLabelText(/nomor telepon/i), "08129999");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    const submitted = updatePhone.mock.calls[0][0] as FormData;
    expect(submitted.get("no_telp")).toBe("08129999");
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts the error when updatePhone fails", async () => {
    const user = userEvent.setup();
    const updatePhone = vi.fn().mockResolvedValue({ ok: false, error: "Nomor telepon tidak valid (8–20 digit)." });
    render(<ProfilForm {...base} updatePhone={updatePhone} />);
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(toast.error).toHaveBeenCalledWith("Nomor telepon tidak valid (8–20 digit).");
  });

  it("resizes a selected file and uploads it on confirm", async () => {
    const user = userEvent.setup();
    resizeToSquareJpeg.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    const uploadPhoto = vi.fn().mockResolvedValue({ ok: true });
    render(<ProfilForm {...base} uploadPhoto={uploadPhoto} />);
    const file = new File(["x"], "p.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/pilih berkas foto/i), file);
    expect(resizeToSquareJpeg).toHaveBeenCalledWith(file);
    await user.click(await screen.findByRole("button", { name: /unggah/i }));
    const submitted = uploadPhoto.mock.calls[0][0] as FormData;
    expect(submitted.get("photo")).toBeInstanceOf(Blob);
  });

  it("toasts the resize error and does not upload", async () => {
    const user = userEvent.setup({ applyAccept: false });
    resizeToSquareJpeg.mockRejectedValue(new Error("Foto harus JPG, PNG, atau WEBP."));
    const uploadPhoto = vi.fn();
    render(<ProfilForm {...base} uploadPhoto={uploadPhoto} />);
    await user.upload(
      screen.getByLabelText(/pilih berkas foto/i),
      new File(["x"], "a.txt", { type: "text/plain" }),
    );
    expect(toast.error).toHaveBeenCalledWith("Foto harus JPG, PNG, atau WEBP.");
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("calls removePhoto when a photo is set", async () => {
    const user = userEvent.setup();
    const removePhoto = vi.fn().mockResolvedValue({ ok: true });
    render(<ProfilForm {...base} photoUrl="https://s/x" removePhoto={removePhoto} />);
    await user.click(screen.getByRole("button", { name: /hapus foto/i }));
    expect(removePhoto).toHaveBeenCalled();
  });
});
