// src/app/(employee)/profil/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { me: { id: "u1" } as { id: string } | null };
const updateResult = { data: [{ id: "u1" }] as { id: string }[] | null, error: null as unknown };
const updateSpy = vi.fn();
const uploadSpy = vi.fn(() => Promise.resolve({ error: null }));
const removeSpy = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      update: (v: unknown) => {
        updateSpy(v);
        return { eq: () => ({ select: () => Promise.resolve(updateResult) }) };
      },
    }),
    storage: { from: () => ({ upload: uploadSpy, remove: removeSpy }) },
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: async () => state.me }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePhone, uploadPhoto, removePhoto } from "./actions";
import { revalidatePath } from "next/cache";

function fd(entries: Record<string, string | Blob>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  state.me = { id: "u1" };
  updateResult.data = [{ id: "u1" }];
  updateResult.error = null;
  updateSpy.mockClear();
  uploadSpy.mockClear();
  removeSpy.mockClear();
  vi.mocked(revalidatePath).mockClear();
});

describe("updatePhone", () => {
  it("refuses when there is no session", async () => {
    state.me = null;
    expect(await updatePhone(fd({ no_telp: "0812" }))).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(updateSpy).not.toHaveBeenCalled();
  });
  it("rejects a malformed phone", async () => {
    const r = await updatePhone(fd({ no_telp: "abc" }));
    expect(r).toEqual({ ok: false, error: "Nomor telepon tidak valid (8–20 digit)." });
  });
  it("clears the phone on an empty string", async () => {
    const r = await updatePhone(fd({ no_telp: "  " }));
    expect(r).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledWith({ no_telp: null });
    expect(revalidatePath).toHaveBeenCalledWith("/profil");
  });
  it("saves a valid phone", async () => {
    const r = await updatePhone(fd({ no_telp: "0812 3456 7890" }));
    expect(r).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledWith({ no_telp: "0812 3456 7890" });
  });
  it("reports failure and does not revalidate on an RLS no-op", async () => {
    updateResult.data = [];
    const r = await updatePhone(fd({ no_telp: "081234567" }));
    expect(r).toEqual({ ok: false, error: "Gagal menyimpan — coba muat ulang." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("uploadPhoto", () => {
  it("rejects a non-Blob", async () => {
    expect(await uploadPhoto(fd({ photo: "x" }))).toEqual({ ok: false, error: "Pilih foto." });
  });
  it("rejects a non-jpeg blob", async () => {
    expect(await uploadPhoto(fd({ photo: new Blob(["x"], { type: "image/png" }) }))).toEqual({
      ok: false, error: "Foto tidak valid.",
    });
  });
  it("rejects an oversized blob", async () => {
    const big = new Blob([new Uint8Array(600 * 1024)], { type: "image/jpeg" });
    expect(await uploadPhoto(fd({ photo: big }))).toEqual({ ok: false, error: "Foto terlalu besar." });
  });
  it("uploads, sets the column, and revalidates the layout", async () => {
    const r = await uploadPhoto(fd({ photo: new Blob(["x"], { type: "image/jpeg" }) }));
    expect(r).toEqual({ ok: true });
    expect(uploadSpy).toHaveBeenCalledWith(
      "u1/avatar.jpg", expect.any(Blob), { contentType: "image/jpeg", upsert: true, cacheControl: "60" },
    );
    expect(updateSpy).toHaveBeenCalledWith({ foto_profil_url: "u1/avatar.jpg" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
  it("uploadPhoto refuses when there is no session", async () => {
    state.me = null;
    expect(await uploadPhoto(fd({ photo: new Blob(["x"], { type: "image/jpeg" }) }))).toEqual({
      ok: false, error: "Tidak diizinkan.",
    });
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("removePhoto", () => {
  it("removes the file, nulls the column, revalidates", async () => {
    const r = await removePhoto();
    expect(r).toEqual({ ok: true });
    expect(removeSpy).toHaveBeenCalledWith(["u1/avatar.jpg"]);
    expect(updateSpy).toHaveBeenCalledWith({ foto_profil_url: null });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
  it("removePhoto refuses when there is no session", async () => {
    state.me = null;
    expect(await removePhoto()).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(removeSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
