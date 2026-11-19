import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { AuditAksiBadge } from "@/components/audit-aksi-badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollText } from "lucide-react";
import { AuditFilters } from "./audit-filters";
import { AuditDetailPopover } from "./audit-detail-popover";
import { aksiIn, allCategorisedAksi, isAuditKategori, kategoriOf, type AuditKategori } from "@/lib/audit/kategori";

const MAX_NAME_MATCHES = 150;

const DOT: Record<AuditKategori, string> = {
  buat: "bg-success-solid",
  ubah: "bg-highlight",
  hapus: "bg-danger-solid",
  setujui: "bg-info-solid",
  tolak: "bg-warning-solid",
  lainnya: "bg-input",
};

const fmt = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string; target?: string; aksi?: string; q?: string; jenis?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: employees, error: employeesError } = await db
    .from("employees")
    .select("id, nama")
    .order("nama");
  if (employeesError) console.error("audit: gagal memuat daftar karyawan", employeesError);

  let q = db
    .from("audit_logs")
    .select(
      "id, waktu, aksi, detail, is_self_action, actor:employees!audit_logs_actor_id_fkey(nama), target:employees!audit_logs_target_employee_id_fkey(nama)",
    )
    .order("waktu", { ascending: false })
    .limit(100);
  if (sp.dari) q = q.gte("waktu", `${sp.dari}T00:00:00+07:00`);
  if (sp.sampai) {
    const end = new Date(`${sp.sampai}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt("waktu", `${end.toISOString().slice(0, 10)}T00:00:00+07:00`);
  }
  if (sp.target) q = q.eq("target_employee_id", sp.target);
  if (sp.aksi) q = q.eq("aksi", sp.aksi);
  const jenis = isAuditKategori(sp.jenis) ? sp.jenis : undefined;
  if (jenis === "lainnya") q = q.not("aksi", "in", `(${allCategorisedAksi().join(",")})`);
  else if (jenis) q = q.in("aksi", aksiIn(jenis));

  // Name search over actor OR target: resolve matching people first, so the
  // match is done by the database rather than over the latest 100 rows only.
  const term = sp.q?.trim();
  let noMatch = false;
  let tooBroad = false;
  if (term) {
    const matched = (employees ?? [])
      .filter((e) => e.nama.toLowerCase().includes(term.toLowerCase()))
      .map((e) => e.id as string);
    // Keep the PostgREST URL well under its length limit.
    tooBroad = matched.length > MAX_NAME_MATCHES;
    const ids = matched.slice(0, MAX_NAME_MATCHES);
    if (ids.length === 0) noMatch = true;
    else {
      const list = ids.join(",");
      q = q.or(`actor_id.in.(${list}),target_employee_id.in.(${list})`);
    }
  }

  const { data: fetched, error } = noMatch ? { data: [], error: null } : await q;
  const rows = fetched ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan"
        title="Log Audit"
        description="Riwayat perubahan data karyawan dan persetujuan cuti."
      />

      <AuditFilters employees={employees ?? []} defaults={sp} />

      {tooBroad && (
        <Alert variant="warning">
          <AlertDescription>
            Kata kunci cocok dengan lebih dari {MAX_NAME_MATCHES} orang; hanya sebagian yang dicari. Persempit pencarian.
          </AlertDescription>
        </Alert>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat log audit.</AlertDescription>
        </Alert>
      ) : (
        rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            message={sp.q || sp.jenis || sp.aksi || sp.target || sp.dari || sp.sampai ? "Tidak ada entri yang cocok." : "Belum ada catatan audit."}
          />
        ) : (
          <ol aria-label="Log audit" className="ml-1.5 flex flex-col border-l-2 border-input">
            {rows.map((r) => {
              const actor = (r.actor as unknown as { nama: string } | null)?.nama ?? "Sistem";
              const target = (r.target as unknown as { nama: string } | null)?.nama;
              const when = fmt.format(new Date(r.waktu));
              return (
                <li
                  key={r.id}
                  className="relative grid gap-x-4 gap-y-1.5 border-b border-border py-3.5 pl-5.5 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-5 -left-[7px] size-3 rounded-full shadow-[0_0_0_3px_var(--background)] ${DOT[kategoriOf(r.aksi)]}`}
                  />
                  <time dateTime={r.waktu} className="pt-0.5 font-mono text-[0.8rem] text-muted-foreground">
                    {when}
                  </time>
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-[0.9rem]">
                    <AuditAksiBadge aksi={r.aksi} />
                    <b className="font-semibold">{actor}</b>
                    {r.is_self_action && <span className="text-xs text-muted-foreground">(aksi sendiri)</span>}
                    {target && <span className="text-muted-foreground">→ {target}</span>}
                  </span>
                  <span className="sm:justify-self-end">
                    <AuditDetailPopover detail={r.detail} label={when} />
                  </span>
                </li>
              );
            })}
          </ol>
        )
      )}
    </div>
  );
}
