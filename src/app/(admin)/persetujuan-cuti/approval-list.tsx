"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  tahunan: "Cuti Tahunan", sakit: "Sakit", melahirkan: "Melahirkan", keguguran: "Keguguran",
  menikah: "Menikah", menikahkan_anak: "Menikahkan Anak", khitan_baptis_anak: "Khitan/Baptis Anak",
  istri_melahirkan_keguguran: "Istri Melahirkan/Keguguran",
  kematian_keluarga_inti: "Kematian Keluarga Inti",
  kematian_keluarga_serumah: "Kematian Keluarga Serumah", lainnya: "Lainnya",
};

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function ApprovalList({
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
      <EmptyState
        icon={CalendarCheck}
        message="Tidak ada pengajuan cuti yang menunggu persetujuan."
      />
    );
  }

  async function handleApprove(id: string) {
    setErrorByRequest((p) => ({ ...p, [id]: "" }));
    setPendingId(id);
    try {
      const r = await approveLeave(id, catatanByRequest[id]?.trim() || null);
      if (!r.ok) setErrorByRequest((p) => ({ ...p, [id]: r.error }));
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(id: string) {
    const catatan = (catatanByRequest[id] || "").trim();
    if (!catatan) {
      setErrorByRequest((p) => ({ ...p, [id]: "Catatan wajib diisi untuk menolak." }));
      return;
    }
    setErrorByRequest((p) => ({ ...p, [id]: "" }));
    setPendingId(id);
    try {
      const r = await rejectLeave(id, catatan);
      if (!r.ok) setErrorByRequest((p) => ({ ...p, [id]: r.error }));
    } finally {
      setPendingId(null);
    }
  }

  // Plain render function, NOT a nested component — calling `<Actions/>` as a
  // component would remount the <Input> on every parent render and drop focus
  // mid-typing. `renderActions(id)` just inlines the JSX.
  const renderActions = (id: string) => {
    const busy = pendingId === id;
    return (
      <div className="flex flex-col gap-2">
        <Input
          aria-label="Catatan penolakan"
          placeholder="Wajib diisi untuk menolak"
          className="h-9 min-w-[180px]"
          value={catatanByRequest[id] ?? ""}
          onChange={(e) => setCatatanByRequest((p) => ({ ...p, [id]: e.target.value }))}
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => handleApprove(id)}>
            Setujui
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => handleReject(id)}
          >
            Tolak
          </Button>
        </div>
        {errorByRequest[id] && (
          <p className="text-xs text-destructive">{errorByRequest[id]}</p>
        )}
      </div>
    );
  };

  return (
    <>
      {/* desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req) => (
              <TableRow key={req.id} className="align-top">
                <TableCell className="font-medium text-foreground">{req.employeeName}</TableCell>
                <TableCell>{JENIS_LABELS[req.jenis] ?? req.jenis}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(req.tanggalMulai)} – {formatDate(req.tanggalSelesai)}
                </TableCell>
                <TableCell>{req.alasan ?? "-"}</TableCell>
                <TableCell>{renderActions(req.id)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* mobile */}
      <div className="flex flex-col gap-3 md:hidden">
        {requests.map((req) => (
          <Card key={req.id} size="sm">
            <CardHeader>
              <CardTitle>{req.employeeName}</CardTitle>
              <Badge variant="neutral" className="w-fit">
                {JENIS_LABELS[req.jenis] ?? req.jenis}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {formatDate(req.tanggalMulai)} – {formatDate(req.tanggalSelesai)}
              </p>
              <p>{req.alasan ?? "-"}</p>
              {renderActions(req.id)}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
