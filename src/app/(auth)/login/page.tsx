import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Sistem Absensi HR</span>
        <h1 className="text-[2.125rem] leading-none font-semibold tracking-[-0.03em] text-foreground">Masuk</h1>
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
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Minimal 8 karakter"
            className="h-12 text-base"
          />
        </Field>
        <Button type="submit" className="h-[50px] w-full rounded-xl text-[0.95rem]">
          Masuk
        </Button>
      </form>
    </div>
  );
}
