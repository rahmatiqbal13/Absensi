import { acceptConsent } from "./actions";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Persetujuan Lokasi &amp; Foto</h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Untuk mencatat absensi, aplikasi ini perlu mengakses lokasi GPS dan mengambil foto selfie
        Anda saat clock-in dan clock-out. Data ini disimpan sesuai kebijakan privasi perusahaan dan
        akan ditandai kedaluwarsa setelah 90 hari.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={acceptConsent}>
        <button
          type="submit"
          className="min-h-11 rounded bg-blue-600 px-6 py-3 text-base font-medium text-white"
        >
          Saya Setuju
        </button>
      </form>
    </main>
  );
}
