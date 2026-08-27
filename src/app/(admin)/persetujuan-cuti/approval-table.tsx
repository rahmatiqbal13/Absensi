"use client";

import { useState } from "react";

export type PendingLeaveRequest = {
  id: string;
  employeeName: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  alasan: string | null;
};

type ActionResult = { ok: true } | { ok: false; error: string };

const JENIS_LABELS: Record<string, string> = {
  tahunan: "Cuti Tahunan",
  sakit: "Sakit",
  melahirkan: "Melahirkan",
  keguguran: "Keguguran",
  menikah: "Menikah",
  menikahkan_anak: "Menikahkan Anak",
  khitan_baptis_anak: "Khitan/Baptis Anak",
  istri_melahirkan_keguguran: "Istri Melahirkan/Keguguran",
  kematian_keluarga_inti: "Kematian Keluarga Inti",
  kematian_keluarga_serumah: "Kematian Keluarga Serumah",
  lainnya: "Lainnya",
};

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ApprovalTable({
  requests,
  approveLeave,
  rejectLeave,
}: {
  requests: PendingLeaveRequest[];
  approveLeave: (requestId: string, catatan: string | null) => Promise<ActionResult>;
  rejectLeave: (requestId: string, catatan: string) => Promise<ActionResult>;
}) {
  const [catatanByRequest, setCatatanByRequest] = useState<Record<string, string>>({});
  const [errorByRequest, setErrorByRequest] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 text-center">
        <svg
          aria-hidden="true"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="mb-3 text-neutral-400"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-neutral-500">Tidak ada pengajuan cuti yang menunggu persetujuan.</p>
      </div>
    );
  }

  async function handleApprove(id: string) {
    setErrorByRequest((prev) => ({ ...prev, [id]: "" }));
    setPendingId(id);
    try {
      const result = await approveLeave(id, catatanByRequest[id]?.trim() || null);
      if (!result.ok) {
        setErrorByRequest((prev) => ({ ...prev, [id]: result.error }));
      }
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(id: string) {
    const catatan = (catatanByRequest[id] || "").trim();
    if (!catatan) {
      setErrorByRequest((prev) => ({ ...prev, [id]: "Catatan wajib diisi untuk menolak." }));
      return;
    }
    setErrorByRequest((prev) => ({ ...prev, [id]: "" }));
    setPendingId(id);
    try {
      const result = await rejectLeave(id, catatan);
      if (!result.ok) {
        setErrorByRequest((prev) => ({ ...prev, [id]: result.error }));
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Karyawan</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Alasan</th>
              <th className="px-4 py-3">Catatan Penolakan</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {requests.map((req) => {
              const busy = pendingId === req.id;
              return (
                <tr key={req.id} className="align-top">
                  <td className="px-4 py-3 font-medium text-neutral-900">{req.employeeName}</td>
                  <td className="px-4 py-3 text-neutral-700">{JENIS_LABELS[req.jenis] ?? req.jenis}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                    {formatDate(req.tanggalMulai)} &ndash; {formatDate(req.tanggalSelesai)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{req.alasan ?? "-"}</td>
                  <td className="px-4 py-3">
                    <label
                      htmlFor={`catatan-${req.id}`}
                      className="mb-1 block text-xs font-medium text-neutral-500"
                    >
                      Catatan Penolakan
                    </label>
                    <input
                      id={`catatan-${req.id}`}
                      type="text"
                      placeholder="Wajib diisi untuk menolak"
                      className="w-full min-w-[180px] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                      value={catatanByRequest[req.id] ?? ""}
                      onChange={(e) =>
                        setCatatanByRequest((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleApprove(req.id)}
                          className="flex min-h-11 items-center justify-center rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none"
                        >
                          Setujui
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReject(req.id)}
                          className="flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none"
                        >
                          Tolak
                        </button>
                      </div>
                      {errorByRequest[req.id] && (
                        <p className="max-w-[220px] rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
                          {errorByRequest[req.id]}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
