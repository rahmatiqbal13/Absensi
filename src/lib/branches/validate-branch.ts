export type BranchInput = {
  nama: FormDataEntryValue | null;
  alamat: FormDataEntryValue | null;
};

export type BranchValue = { nama: string; alamat: string | null };

export type BranchResult =
  | { ok: true; value: BranchValue }
  | { ok: false; error: string };

export function validateBranchInput(input: BranchInput): BranchResult {
  const nama = String(input.nama ?? "").trim();
  const alamat = String(input.alamat ?? "").trim();

  if (!nama) return { ok: false, error: "Nama cabang wajib diisi." };
  if (nama.length > 100) return { ok: false, error: "Nama cabang maksimal 100 karakter." };
  if (alamat.length > 200) return { ok: false, error: "Alamat maksimal 200 karakter." };

  return { ok: true, value: { nama, alamat: alamat || null } };
}
