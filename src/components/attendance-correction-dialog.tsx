"use client";

import { useId, useState, useTransition } from "react";
import { ClipboardPen } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Result = { ok: true } | { ok: false; error: string };

export type CorrectionDefaults = {
  tanggal: string; // YYYY-MM-DD
  jamMasuk?: string; // HH:MM WIB
  jamPulang?: string; // HH:MM WIB
};

/**
 * Form to correct one day's jam masuk / jam pulang. Used by employees (sends a
 * request for approval) and by HR (applies directly) — the caller supplies the
 * action and the wording.
 */
export function AttendanceCorrectionDialog({
  action,
  defaults,
  minDate,
  maxDate,
  title,
  description,
  submitLabel,
  successMessage,
  trigger = "button",
  triggerLabel = "Ajukan koreksi",
}: {
  action: (formData: FormData) => Promise<Result>;
  defaults: CorrectionDefaults;
  minDate?: string;
  maxDate: string;
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  /** "button" = outline button; "link" = compact text button for list rows. */
  trigger?: "button" | "link";
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await action(formData);
      if (r.ok) {
        setOpen(false);
        toast.success(successMessage);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        {trigger === "link" ? (
          <Button variant="ghost" size="sm" className="-ml-2 self-start text-brand-text">
            <ClipboardPen className="size-4" aria-hidden="true" /> {triggerLabel}
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <ClipboardPen className="size-4" aria-hidden="true" /> {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field id={`${uid}-tanggal`} label="Tanggal">
            <Input
              name="tanggal"
              type="date"
              required
              defaultValue={defaults.tanggal}
              min={minDate}
              max={maxDate}
              className="h-11"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${uid}-masuk`} label="Jam masuk (WIB)">
              <Input name="jamMasuk" type="time" required defaultValue={defaults.jamMasuk} className="h-11" />
            </Field>
            <Field id={`${uid}-pulang`} label="Jam pulang (WIB)" hint="Kosongkan jika belum pulang.">
              <Input name="jamPulang" type="time" defaultValue={defaults.jamPulang} className="h-11" />
            </Field>
          </div>
          <Field id={`${uid}-alasan`} label="Alasan">
            <Textarea
              name="alasan"
              required
              maxLength={500}
              rows={3}
              placeholder="Mis. lupa absen pulang, HP mati, GPS tidak terdeteksi."
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
