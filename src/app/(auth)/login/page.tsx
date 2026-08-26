import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={login} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Masuk</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded border px-3 py-2 text-base"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm">Kata Sandi</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded border px-3 py-2 text-base"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-3 text-base font-medium text-white"
        >
          Masuk
        </button>
      </form>
    </main>
  );
}
