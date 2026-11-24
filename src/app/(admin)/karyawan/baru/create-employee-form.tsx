"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EyebrowPill } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmployeeFormFields } from "../employee-form-fields";

// Why the link is safe to paste into chat apps, and what to do when it lapses.
const INVITE_NOTES = [
  {
    title: "Sekali pakai",
    body: "Token hanya ditukar oleh halaman set-password, jadi pratinjau tautan di WhatsApp atau Telegram tidak menghanguskannya.",
    box: "bg-leave",
    title_: "text-leave-foreground",
  },
  {
    title: "Domain sendiri",
    body: "Link memakai alamat aplikasi Anda, bukan alamat verifikasi Supabase.",
    box: "bg-info",
    title_: "text-info-foreground",
  },
  {
    title: "Kedaluwarsa",
    body: "Bila link tidak valid, buat ulang dari halaman karyawan dan kirim yang baru.",
    box: "bg-warning",
    title_: "text-warning-foreground",
  },
];

type Result = { ok: true; setPasswordUrl: string | null } | { ok: false; error: string };

export function CreateEmployeeForm({
  branches,
  departments,
  approverOptions,
  createEmployee,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  createEmployee: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  // Created without email: no set-password link to hand out.
  const [noLogin, setNoLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invitee, setInvitee] = useState({ nama: "", email: "" });

  async function action(formData: FormData) {
    setError(null);
    setLink(null);
    setBusy(true);
    try {
      const r = await createEmployee(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInvitee({
        nama: String(formData.get("nama") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
      });
      setLink(r.setPasswordUrl);
      setNoLogin(!r.setPasswordUrl);
    } catch (e) {
      console.error("create-employee-form action failed", e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (noLogin) {
    return (
      <div className="flex max-w-[760px] flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <EyebrowPill tone="success">Pegawai ditambahkan</EyebrowPill>
          <h2 className="text-[clamp(1.6rem,3.2vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em]">
            {invitee.nama ? `${invitee.nama} sudah terdaftar.` : "Karyawan sudah terdaftar."}
          </h2>
          <p className="max-w-[60ch] text-[0.95rem] leading-relaxed text-muted-foreground">
            Didaftarkan tanpa email: absen lewat mesin fingerprint langsung tercatat setelah PIN mesinnya dipasangkan
            (Pengaturan → Mesin absensi), tetapi ia belum bisa masuk ke aplikasi. Isi email di halaman pegawai kapan saja,
            lalu buat link atur kata sandi dari sana.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild className="h-11 px-5">
            <Link href="/pengaturan/mesin-absensi">Pasangkan PIN mesin</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 px-4">
            <Link href="/karyawan">Kembali ke daftar karyawan</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4"
            onClick={() => {
              setNoLogin(false);
              setInvitee({ nama: "", email: "" });
            }}
          >
            <UserPlus /> Tambah karyawan lain
          </Button>
        </div>
      </div>
    );
  }

  if (link) {
    return (
      <div className="flex max-w-[760px] flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <EyebrowPill tone="success">Akun dibuat</EyebrowPill>
          <h2 className="text-[clamp(1.6rem,3.2vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em]">
            {invitee.nama ? `${invitee.nama} sudah terdaftar.` : "Karyawan sudah terdaftar."}
          </h2>
          <p className="max-w-[56ch] text-[0.95rem] leading-relaxed text-muted-foreground">
            Kirim link berikut ke karyawan (berlaku terbatas). Sistem tidak mengirim email otomatis.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-url" className="text-[0.8rem] font-semibold">
                Link set-password{invitee.email ? ` untuk ${invitee.email}` : ""}
              </label>
              <div className="flex flex-wrap gap-2.5">
                <Input
                  id="invite-url"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-11 min-w-0 flex-[1_1_320px] bg-muted/50 font-mono text-[0.8rem]"
                />
                <Button
                  type="button"
                  className="h-11 px-5"
                  onClick={() => {
                    navigator.clipboard?.writeText(link).catch(() => {});
                    setCopied(true);
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Tersalin" : "Salin link"}
                </Button>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {INVITE_NOTES.map((n) => (
                <li key={n.title} className={cn("flex flex-col gap-1 rounded-xl p-3.5", n.box)}>
                  <span className={cn("text-[0.85rem] font-semibold", n.title_)}>{n.title}</span>
                  <span className="text-[0.8rem] leading-relaxed text-foreground/80">{n.body}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild className="h-11 px-5">
            <Link href="/karyawan">Kembali ke daftar karyawan</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4"
            onClick={() => {
              setLink(null);
              setCopied(false);
              setInvitee({ nama: "", email: "" });
            }}
          >
            <UserPlus /> Tambah karyawan lain
          </Button>
        </div>
      </div>
    );
  }

  // Each section of EmployeeFormFields is its own card; no outer card.
  return (
    <form action={action} className="space-y-6">
      <EmployeeFormFields
        branches={branches}
        departments={departments}
        approverOptions={approverOptions}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={busy}>
        Buat &amp; Ambil Link
      </Button>
    </form>
  );
}
