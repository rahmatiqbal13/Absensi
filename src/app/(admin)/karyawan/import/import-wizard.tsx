"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Download, FileUp, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportResult, PreviewRow } from "./actions";

type Preview = (text: string) => Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; error: string }>;
type Run = (text: string) => Promise<{ ok: true; results: ImportResult[] } | { ok: false; error: string }>;

function downloadLinks(results: ImportResult[]) {
  const cell = (v: string) => (/[",;\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["nama;email;link_atur_kata_sandi", ...results.filter((r) => r.ok).map((r) => [r.nama, r.email, r.setPasswordUrl ?? ""].map(cell).join(";"))];
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "link-undangan-karyawan.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ preview, run }: { preview: Preview; run: Run }) {
  const [text, setText] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = rows?.filter((r) => r.ok).length ?? 0;

  async function onFile(file: File | undefined) {
    setError(null);
    setRows(null);
    setResults(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setError("Simpan file Excel sebagai CSV dulu (File → Save As → CSV).");
    const t = await file.text();
    setText(t);
    startTransition(async () => {
      const r = await preview(t);
      if (r.ok) setRows(r.rows);
      else setError(r.error);
    });
  }

  if (results) {
    const done = results.filter((r) => r.ok).length;
    return (
      <div className="space-y-4">
        <Alert>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertDescription>
            {done} karyawan dibuat{results.length - done ? `, ${results.length - done} dilewati` : ""}. Kirimkan link atur kata
            sandi ke masing-masing karyawan (berlaku sekali pakai).
          </AlertDescription>
        </Alert>
        {done > 0 && (
          <Button onClick={() => downloadLinks(results)}>
            <Download className="size-4" aria-hidden="true" /> Unduh daftar link undangan (CSV)
          </Button>
        )}
        <ResultTable rows={results.map((r) => ({ line: r.line, nama: r.nama, email: r.email, ok: r.ok, error: r.error }))} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <label htmlFor="import-file" className="flex items-center gap-2 text-sm font-semibold">
          <FileUp className="size-4" aria-hidden="true" /> Pilih file CSV
        </label>
        <Input id="import-file" type="file" accept=".csv,text/csv" disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">Maksimal 200 baris. Nama cabang & departemen harus sama dengan di Pengaturan.</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {pending && !rows && <p className="text-sm text-muted-foreground">Memeriksa file…</p>}
      {rows && (
        <>
          <p className="text-sm">
            <b>{valid}</b> baris siap diimpor{rows.length - valid ? `, ${rows.length - valid} bermasalah (dilewati)` : ""}.
          </p>
          <ResultTable rows={rows} />
          <Button
            disabled={pending || valid === 0 || !text}
            onClick={() =>
              startTransition(async () => {
                const r = await run(text!);
                if (r.ok) setResults(r.results);
                else setError(r.error);
              })
            }
          >
            {pending ? "Mengimpor…" : `Impor ${valid} karyawan`}
          </Button>
        </>
      )}
    </div>
  );
}

function ResultTable({ rows }: { rows: { line: number; nama: string; email: string; ok: boolean; error?: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Hasil pemeriksaan per baris</caption>
        <thead className="bg-muted text-left">
          <tr>
            <th className="px-3 py-2 font-semibold">Baris</th>
            <th className="px-3 py-2 font-semibold">Nama</th>
            <th className="px-3 py-2 font-semibold">Email</th>
            <th className="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className="border-t border-border">
              <td className="px-3 py-2 font-mono tabular-nums">{r.line}</td>
              <td className="px-3 py-2">{r.nama || "—"}</td>
              <td className="px-3 py-2">{r.email || "—"}</td>
              <td className="px-3 py-2">
                {r.ok ? (
                  <span className="inline-flex items-center gap-1 text-success-foreground">
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Siap
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <XCircle className="size-4" aria-hidden="true" /> {r.error}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
