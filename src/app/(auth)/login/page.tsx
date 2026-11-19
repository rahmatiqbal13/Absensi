import Link from "next/link";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { login } from "./actions";

/** Greeting by the hour in WIB. */
function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(now));
  if (h < 11) return "Selamat pagi.";
  if (h < 15) return "Selamat siang.";
  if (h < 18) return "Selamat sore.";
  return "Selamat malam.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  const now = new Date();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}
        </span>
        <p className="text-[2.125rem] leading-none font-bold tracking-[-0.02em] text-muted-foreground">{greeting(now)}</p>
        <h1 className="text-[2.125rem] leading-none font-bold tracking-[-0.02em] text-foreground">Masuk</h1>
      </div>

      {reason === "nonaktif" && (
        <Alert variant="warning">
          <AlertDescription>Akun Anda nonaktif. Hubungi HR untuk mengaktifkan kembali.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={login} className="flex flex-col gap-4.5">
        <Field id="email" label="Email">
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-12 text-base" />
        </Field>
        <Field id="password" label="Kata Sandi">
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Minimal 8 karakter"
            className="h-12 text-base"
          />
        </Field>
        <Link
          href="/lupa-password"
          className="-mt-2 self-end text-sm font-semibold text-brand-text underline-offset-4 hover:underline"
        >
          Lupa kata sandi?
        </Link>
        <SubmitButton pendingLabel="Sedang masuk…" className="h-[50px] w-full rounded-xl text-[0.95rem]">
          Masuk
        </SubmitButton>
      </form>
      <Link
        href="/set-password"
        className="self-start text-sm font-semibold text-brand-text underline-offset-4 hover:underline"
      >
        Punya undangan? Atur kata sandi
      </Link>
    </div>
  );
}
