import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <MapPin className="size-9 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">Persetujuan Lokasi &amp; Foto</h1>
          <p className="text-sm text-muted-foreground">
            Untuk mencatat absensi, aplikasi ini perlu mengakses lokasi GPS dan mengambil foto
            selfie Anda saat clock-in dan clock-out. Data ini disimpan sesuai kebijakan privasi
            perusahaan dan akan ditandai kedaluwarsa setelah 90 hari.
          </p>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <form action={acceptConsent} className="w-full">
            <Button type="submit" size="lg" className="w-full">
              Saya Setuju
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
