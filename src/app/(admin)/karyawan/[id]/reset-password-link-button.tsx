"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Result = { ok: true; url: string } | { ok: false; error: string };

/**
 * HR-side fallback for a forgotten password: generates a one-time reset link
 * to hand to the employee (chat, in person) when email isn't available.
 */
export function ResetPasswordLinkButton({
  employeeName,
  createLink,
}: {
  employeeName: string;
  createLink: () => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const r = await createLink();
      if (r.ok) {
        setLink(r.url);
        setCopied(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setLink(null); // never leave a live link sitting in a closed dialog
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="size-4" aria-hidden="true" /> Reset kata sandi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link reset kata sandi</DialogTitle>
          <DialogDescription>
            Buat link sekali pakai untuk {employeeName}, lalu kirimkan langsung kepadanya. Kata sandi lama tetap
            berlaku sampai link ini dipakai.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="reset-url" className="text-[0.8rem] font-semibold">
              Link reset
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="reset-url"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 min-w-0 flex-[1_1_240px] bg-muted/50 font-mono text-[0.8rem]"
              />
              <Button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(link).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "Tersalin" : "Salin link"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Jangan kirim ke grup. Siapa pun yang memegang link ini bisa mengganti kata sandi akun tersebut.
            </p>
          </div>
        ) : (
          <Button onClick={generate} disabled={pending} className="self-start">
            <KeyRound className="size-4" aria-hidden="true" />
            {pending ? "Membuat link…" : "Buat link reset"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
