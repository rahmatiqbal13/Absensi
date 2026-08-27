import { acceptConsent } from "./actions";

// The `error` query param is attacker-controllable (anyone can hand an employee
// a /absen/consent?error=... link), so it is never rendered as free text. Only
// these known codes produce a message, and the message is hardcoded here.
const ERROR_MESSAGES: Record<string, string> = {
  gagal: "Gagal menyimpan persetujuan. Silakan coba lagi.",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <svg
          aria-hidden="true"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-blue-600"
        >
          <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <h1 className="text-xl font-semibold text-neutral-900">Persetujuan Lokasi &amp; Foto</h1>
        <p className="text-sm text-neutral-600">
          Untuk mencatat absensi, aplikasi ini perlu mengakses lokasi GPS dan mengambil foto
          selfie Anda saat clock-in dan clock-out. Data ini disimpan sesuai kebijakan privasi
          perusahaan dan akan ditandai kedaluwarsa setelah 90 hari.
        </p>
        {errorMessage && (
          <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <form action={acceptConsent} className="w-full">
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Saya Setuju
          </button>
        </form>
      </div>
    </main>
  );
}
