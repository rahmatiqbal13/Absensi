"use client";

import { Fragment, useState } from "react";
import type { ActionResult } from "../actions";
import type { RincianHarianEntry } from "@/lib/payroll/deduction";
import { formatRupiah } from "@/lib/format/rupiah";

export type PayslipView = {
  id: string;
  nama: string;
  gajiPokok: number;
  hariKerjaEfektif: number;
  totalPotongan: number;
  gajiAkhir: number;
  rincian: RincianHarianEntry[];
};

export function PayslipTable({
  rows,
  status,
  onGenerate,
  onFinalize,
}: {
  rows: PayslipView[];
  status: "draft" | "final";
  onGenerate: () => Promise<ActionResult>;
  onFinalize: () => Promise<ActionResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setError(null);
    setMessage(null);
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? "Berhasil.");
  }

  return (
    <div className="space-y-4">
      {status === "draft" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onGenerate)}
            className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {rows.length ? "Regenerate" : "Generate"}
          </button>
          {rows.length > 0 && !confirming && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="min-h-10 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 disabled:opacity-60"
            >
              Finalisasi
            </button>
          )}
          {confirming && (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-neutral-700">Kunci periode ini?</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(onFinalize).then(() => setConfirming(false))}
                className="rounded bg-red-600 px-3 py-1.5 font-medium text-white"
              >
                Ya, finalisasi
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded border border-neutral-300 px-3 py-1.5">
                Batal
              </button>
            </span>
          )}
        </div>
      )}

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Belum ada slip gaji. Klik Generate.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Gaji Pokok</th>
                <th className="px-4 py-2 font-medium">Hari Efektif</th>
                <th className="px-4 py-2 font-medium">Potongan</th>
                <th className="px-4 py-2 font-medium">Gaji Akhir</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className="px-4 py-2 font-medium text-neutral-900">{row.nama}</td>
                    <td className="px-4 py-2">{formatRupiah(row.gajiPokok)}</td>
                    <td className="px-4 py-2">{row.hariKerjaEfektif}</td>
                    <td className="px-4 py-2 text-red-600">{formatRupiah(row.totalPotongan)}</td>
                    <td className="px-4 py-2 font-semibold text-neutral-900">{formatRupiah(row.gajiAkhir)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Rincian ${row.nama}`}
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        {expanded === row.id ? "Tutup" : "Rincian"}
                      </button>
                      <a href={`/slip-gaji/${row.id}/pdf`} className="ml-3 text-xs text-blue-700 hover:underline">
                        PDF
                      </a>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr>
                      <td colSpan={6} className="bg-neutral-50 px-4 py-2">
                        <ul className="space-y-1 text-xs text-neutral-600">
                          {row.rincian.map((r) => (
                            <li key={r.tanggal} className="flex flex-wrap gap-x-4">
                              <span className="w-24">{r.tanggal}</span>
                              <span className="w-20">{r.jenis}</span>
                              <span className="w-28">{r.status ?? "-"}</span>
                              <span>terlambat {r.menit_terlambat}m · pulang cepat {r.menit_pulang_cepat}m</span>
                              <span className="text-red-600">{formatRupiah(r.potongan)}</span>
                              {r.catatan && <span className="italic">{r.catatan}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
