"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export function SortHeader({
  label,
  field,
  defaultSort,
  defaultDirection = "desc",
  directionKey = "direction",
  className = "px-3 py-3",
}: {
  label: string;
  field: string;
  defaultSort: string;
  defaultDirection?: "asc" | "desc";
  directionKey?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = (search.get("sort") ?? defaultSort) === field;
  const direction = search.get(directionKey) ?? defaultDirection;
  const nextDirection = active && direction === "asc" ? "desc" : "asc";
  const query = new URLSearchParams(search);
  query.set("sort", field);
  query.set(directionKey, nextDirection);
  query.delete("page");
  const Icon = active
    ? direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <th
      className={className}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Link
        href={`${pathname}?${query}`}
        className="inline-flex items-center gap-1.5"
        aria-label={`${label}: sort ${nextDirection === "asc" ? "ascending" : "descending"}`}
      >
        {label}
        <Icon aria-hidden="true" className="size-3" />
      </Link>
    </th>
  );
}
