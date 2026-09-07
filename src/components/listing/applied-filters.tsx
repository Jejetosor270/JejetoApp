"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { clearFiltersHref } from "./filter-navigation";
export function AppliedFilters({ labels }: { labels: Record<string, string> }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = [...search.entries()].filter(
    ([key, value]) => value && labels[key],
  );
  if (!active.length) return null;
  return (
    <div
      aria-label="Applied filters"
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      {[...new Set(active.map(([key]) => key))].map((key) => {
        const query = new URLSearchParams(search);
        query.delete(key);
        query.delete("page");
        return (
          <Link
            key={key}
            href={`${pathname}?${query}`}
            aria-label={`Remove filter: ${labels[key]}`}
            className="bg-muted/40 text-muted-foreground hover:text-foreground rounded-md border px-2 py-1"
          >
            {labels[key]}{" "}
            <span aria-hidden="true" className="ml-1">
              ×
            </span>
          </Link>
        );
      })}
      <Link
        href={clearFiltersHref(pathname, new URLSearchParams(search))}
        className="text-muted-foreground hover:text-foreground underline underline-offset-4"
      >
        Clear filters
      </Link>
    </div>
  );
}
