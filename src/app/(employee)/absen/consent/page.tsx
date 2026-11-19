import { Alert, AlertDescription } from "@/components/ui/alert";
import { acceptConsent } from "./actions";
import { ConsentForm } from "./consent-form";

// The `error` query param is attacker-controllable (anyone can hand an employee
// a /absen/consent?error=... link), so it is never rendered as free text. Only
// these known codes produce a message, and the message is hardcoded here.
const ERROR_MESSAGES: Record<string, string> = {
  gagal: "Gagal menyimpan persetujuan. Silakan coba lagi.",
  setuju: "Centang persetujuan dulu untuk melanjutkan.",
};

// Kept truthful to the code: GPS is watched while the Absen page is open
// (ProximityPanel), selfies are purged after 90 days (migration 0025), and a
// withdrawal sends the employee back here before the next clock-in.
const POINTS = [
  {
    title: "Lokasi saat absen",
    body: "Dibaca selama halaman Absen terbuka, untuk mencocokkan posisi Anda dengan radius kantor.",
  },
  {
    title: "Foto selfie",
    body: "Disimpan 90 hari sebagai bukti kehadiran, lalu dihapus otomatis.",
  },
  {
    title: "Anda bisa mencabutnya",
    body: "Kapan saja lewat Profil. Setelah dicabut, Anda perlu menyetujui lagi sebelum absen berikutnya.",
  },
];

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pt-6 pb-8">
      <h1 className="text-[2rem] leading-[1.05] font-bold tracking-[-0.02em] text-foreground">
        Kami perlu dua izin untuk mencatat kehadiran Anda.
      </h1>
      <ol className="flex flex-col border-t border-border">
        {POINTS.map((p) => (
          <li key={p.title} className="border-b border-border py-4">
            <p className="text-[0.95rem] font-semibold text-foreground">{p.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </li>
        ))}
      </ol>
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      <ConsentForm action={acceptConsent} />
    </main>
  );
}
