"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { clearFiltersHref, hasListFilters } from "./filter-navigation";
import { EmptyState } from "@/components/ui/empty-state";

export function ListEmptyState({ entity }: { entity: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filtered = hasListFilters(new URLSearchParams(params));
  return (
    <EmptyState
      title={
        filtered ? `No ${entity} match these filters.` : `No ${entity} yet.`
      }
      description={
        filtered ? undefined : "Records will appear here when they are added."
      }
      action={
        filtered ? (
          <Link
            className="text-primary underline underline-offset-4"
            href={clearFiltersHref(pathname, new URLSearchParams(params))}
          >
            Clear filters
          </Link>
        ) : undefined
      }
    />
  );
}
