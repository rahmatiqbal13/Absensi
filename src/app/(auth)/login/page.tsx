import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-semibold text-white">
            A
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Masuk</h1>
            <p className="mt-1 text-sm text-neutral-500">Sistem Absensi HR</p>
          </div>
        </div>

        <form action={login} className="space-y-4">
          {reason === "nonaktif" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Akun Anda nonaktif. Hubungi HR untuk mengaktifkan kembali.
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base text-neutral-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-neutral-700">
              Kata Sandi
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base text-neutral-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Masuk
          </button>
        </form>
      </div>
    </main>
  );
}
