"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { clearFiltersHref, hasListFilters } from "./filter-navigation";

export function ListEmptyState({ entity }: { entity: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filtered = hasListFilters(new URLSearchParams(params));
  return (
    <div className="space-y-2 px-4 py-6 text-center text-sm">
      <p className="font-medium">
        {filtered ? `No ${entity} match these filters.` : `No ${entity} yet.`}
      </p>
      {filtered ? (
        <Link
          className="text-primary underline underline-offset-4"
          href={clearFiltersHref(pathname, new URLSearchParams(params))}
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
