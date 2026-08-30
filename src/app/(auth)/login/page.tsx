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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Masuk</h1>
        <p className="text-sm text-muted-foreground">Sistem Absensi HR</p>
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

      <form action={login} className="space-y-4">
        <Field id="email" label="Email">
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-11 text-base" />
        </Field>
        <Field id="password" label="Kata Sandi">
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-11 text-base"
          />
        </Field>
        <Button type="submit" className="h-11 w-full text-base">
          Masuk
        </Button>
      </form>
    </div>
  );
}
