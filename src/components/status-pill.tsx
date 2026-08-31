import { Badge } from "@/components/ui/badge";

export function StatusPill({ status }: { status: "aktif" | "nonaktif" }) {
  return status === "aktif" ? (
    <Badge variant="success">Aktif</Badge>
  ) : (
    <Badge variant="neutral">Nonaktif</Badge>
  );
}
