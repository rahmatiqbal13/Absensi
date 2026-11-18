import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AnnouncementComposer, DeleteAnnouncementButton } from "./announcement-composer";
import { createAnnouncement, deleteAnnouncement } from "./actions";

export const metadata = { title: "Pengumuman" };

const WAKTU = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function PengumumanPage() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  const isHr = me.role === "hr_admin" || me.role === "super_admin";

  // RLS returns only what is addressed to the viewer (HR: everything).
  const [listRes, branchRes, deptRes] = await Promise.all([
    db
      .from("announcements")
      .select("id, judul, isi, sasaran, created_at, branches(nama), departments(nama), author:employees!announcements_created_by_fkey(nama)")
      .order("created_at", { ascending: false })
      .limit(50),
    isHr ? db.from("branches").select("id, nama").order("nama") : Promise.resolve({ data: [] }),
    isHr ? db.from("departments").select("id, nama").order("nama") : Promise.resolve({ data: [] }),
  ]);
  if (listRes.error) console.error("PengumumanPage: list failed", listRes.error);
  const items = (listRes.data ?? []) as unknown as {
    id: string;
    judul: string;
    isi: string;
    sasaran: "semua" | "cabang" | "departemen";
    created_at: string;
    branches: { nama: string } | null;
    departments: { nama: string } | null;
    author: { nama: string } | null;
  }[];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <PageHeader eyebrow="Informasi" title="Pengumuman" description="Informasi resmi dari HR." />
      {isHr && (
        <AnnouncementComposer
          branches={(branchRes.data ?? []) as { id: string; nama: string }[]}
          departments={(deptRes.data ?? []) as { id: string; nama: string }[]}
          create={createAnnouncement}
        />
      )}
      {listRes.error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat pengumuman. Muat ulang halaman.</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState icon={Megaphone} message="Belum ada pengumuman." />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} id={a.id} className="scroll-mt-24 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="font-semibold text-foreground">{a.judul}</h2>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{WAKTU.format(new Date(a.created_at))}</span>
                    {a.author?.nama && <span>· {a.author.nama}</span>}
                    {isHr && (
                      <Badge variant="neutral">
                        {a.sasaran === "semua" ? "Semua" : a.sasaran === "cabang" ? a.branches?.nama ?? "Cabang" : a.departments?.nama ?? "Departemen"}
                      </Badge>
                    )}
                  </p>
                </div>
                {isHr && <DeleteAnnouncementButton onDelete={deleteAnnouncement.bind(null, a.id)} />}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-foreground">{a.isi}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
