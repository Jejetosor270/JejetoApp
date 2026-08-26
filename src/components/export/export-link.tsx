import Link from "next/link";
import { Download } from "lucide-react";

export function ExportLink({
  entity,
  queryString,
}: {
  entity: "clients" | "orders" | "payments" | "projects" | "suppliers";
  queryString: string;
}) {
  const query = new URLSearchParams(queryString);
  query.delete("page");
  query.delete("pageSize");
  return (
    <Link
      className="border-input bg-background hover:bg-muted inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
      href={`/exports/${entity}?${query.toString()}`}
    >
      <Download className="size-4" />
      Export CSV
    </Link>
  );
}
