import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "./actions";

export default async function LupaPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; terkirim?: string }>;
}) {
  const { error, terkirim } = await searchParams;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Sistem Absensi HR</span>
        <h1 className="text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] text-foreground">
          Lupa kata sandi
        </h1>
        {!terkirim && (
          <p className="text-sm text-muted-foreground">
            Masukkan email akun Anda. Kami kirimkan link untuk membuat kata sandi baru.
          </p>
        )}
      </div>

      {terkirim ? (
        <Alert>
          <MailCheck aria-hidden="true" />
          <AlertDescription>
            Jika email tersebut terdaftar, link atur ulang kata sandi sudah dikirim. Periksa kotak masuk dan folder
            spam. Tidak menerima email dalam beberapa menit? Minta HR membuatkan link reset untuk Anda.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form action={requestPasswordReset} className="flex flex-col gap-4.5">
            <Field id="email" label="Email">
              <Input id="email" name="email" type="email" required autoComplete="email" className="h-12 text-base" />
            </Field>
            <SubmitButton pendingLabel="Mengirim…" className="h-[50px] w-full rounded-xl text-[0.95rem]">
              Kirim link reset
            </SubmitButton>
          </form>
        </>
      )}

      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand-text underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Kembali ke halaman masuk
      </Link>
    </div>
  );
}
