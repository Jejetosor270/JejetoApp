"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const presentationKeys = new Set([
  "view",
  "tab",
  "sort",
  "direction",
  "sortDirection",
  "page",
  "pageSize",
  "portfolioView",
]);

export function ListEmptyState({ entity }: { entity: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filtered = Array.from(params.entries()).some(
    ([name, value]) => value && !presentationKeys.has(name),
  );
  return (
    <div className="space-y-2 px-4 py-10 text-center text-sm">
      <p className="font-medium">
        {filtered ? `No ${entity} match these filters.` : `No ${entity} yet.`}
      </p>
      {filtered ? (
        <Link
          className="text-primary underline underline-offset-4"
          href={pathname}
        >
          Clear filters
        </Link>
      ) : (
        <p className="text-muted-foreground">
          Records will appear here when they are added.
        </p>
      )}
    </div>
  );
}
